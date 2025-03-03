import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, Contract } from 'ethers';

import { fp } from '@balancer-labs/v2-helpers/src/numbers';
import { advanceTime, currentTimestamp, MONTH } from '@balancer-labs/v2-helpers/src/time';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { ZERO_ADDRESS } from '@balancer-labs/v2-helpers/src/constants';
import { deploy, deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';

import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import { toNormalizedWeights } from '@balancer-labs/balancer-js';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { randomBytes } from 'ethers/lib/utils';
import {
  MAX_INT256,
} from '@balancer-labs/v2-helpers/src/constants';

describe('WeightedPoolFactoryRWA', function () {
  let tokens: TokenList;
  let factory: Contract;
  let vault: Vault;
  let rateProviders: string[];
  let owner: SignerWithAddress;
  let authorizer: Contract;
  let rwaRegistry: Contract;
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let deployer: SignerWithAddress;
  let notOperator: SignerWithAddress;
  let params: any;
  let salt: string;

  const NAME = 'Balancer Pool Token';
  const SYMBOL = 'BPT';
  const POOL_SWAP_FEE_PERCENTAGE = fp(0.01);
  const WEIGHTS = toNormalizedWeights([fp(30), fp(70), fp(5), fp(5)]);

  const BASE_PAUSE_WINDOW_DURATION = MONTH * 3;
  const BASE_BUFFER_PERIOD_DURATION = MONTH;
  const OPERATOR_ROLE = '0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929'; //keccak256("OPERATOR_ROLE");

  before('setup signers', async () => {
    [deployer, owner, admin, operator, notOperator] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy factory & tokens', async () => {
    vault = await Vault.create();
    // ({ instance: vault, authorizer, rwaRegistry } = await Vault.create({ admin }));
    authorizer = await deploy('v2-vault/Authorizer', { args: [admin.address] });

    rwaRegistry = await deploy('v2-vault/RwaRegistry', { args: [authorizer.address] });
    factory = await deploy('WeightedPoolFactory', {
      args: [
        vault.address,
        vault.getFeesProvider().address,
        BASE_PAUSE_WINDOW_DURATION,
        BASE_BUFFER_PERIOD_DURATION,
        authorizer.address,
        rwaRegistry.address,
      ],
    });

    tokens = await TokenList.create(['MKR', 'DAI', 'SNX', 'BAT'], { sorted: true });

    rateProviders = await tokens.asyncMap(async () => (await deploy('v2-pool-utils/MockRateProvider')).address);
    await authorizer.connect(admin).grantRole(OPERATOR_ROLE, factory.address);
    // check factory has operator role
  });

  describe('WeightedPoolFactory creating RWA pools', () => {
    let v: number;
    let r: string;
    let s: string;
    let deadline: any;

    const operatorPk = '0x59c6995e998f97a5a00467e6c7e82d306fb1c0d9ca5864f27fe0b0ec4f42e693';
    const operatorAddress = '0x1Df5CE618C4760F4a277B4BCc97853671Cec8F4c';
    sharedBeforeEach('set up signature', async () => {
      params = {
        name: 'RWA Pool',
        symbol: 'RWAP',
        // tokens: [tokens.addresses[0], tokens.addresses[1]],
        // normalizedWeights: [WEIGHTS[0], WEIGHTS[1]],
        // rateProviders: [rateProviders[0], rateProviders[1]],
        tokens: tokens.addresses,
        normalizedWeights: WEIGHTS,
        rateProviders: rateProviders,
        swapFeePercentage: POOL_SWAP_FEE_PERCENTAGE,
        owner: owner.address,
        // isRWA: [true, false],
        isRWA: [true, false, false, false],
      };
      await authorizer.connect(admin).grantRole(OPERATOR_ROLE, operator.address);
      const nonce = await factory.getNextNonce(deployer.address);
      deadline = MAX_INT256;
      const structHash = await factory.getPoolCreationHash(params, deadline, nonce);

      const domainSeparator = await factory.getDomainSeparator();
      console.log('domainSeparator', domainSeparator);
      const encodedData = ethers.utils.solidityPack(
        ['bytes2', 'bytes32', 'bytes32'],
        ['0x1901', domainSeparator, structHash]
      );

      const digest = ethers.utils.keccak256(encodedData);

      const operatorWallet = new ethers.Wallet(operatorPk, ethers.provider);
      const signature = operatorWallet._signingKey().signDigest(digest);

      const splitSig = ethers.utils.splitSignature(signature);
      v = splitSig.v;
      r = splitSig.r;
      s = splitSig.s;
      salt = ethers.utils.formatBytes32String('testSalt');
    });
    it('should create an RWA pool successfully', async function () {
      const authorization = { operator: operatorAddress, v: v, r: r, s: s };

      await authorizer.connect(admin).grantRole(OPERATOR_ROLE, operatorAddress);

      const tx = await factory.createRWAPool(params, deadline, salt, authorization, { from: deployer.address });
      await expect(tx).to.emit(factory, 'PoolCreated');

      // check first tokens is RWA
      const isRWA = await rwaRegistry.isRwaToken(tokens.addresses[0]);
      expect(isRWA).to.be.true;

      // check second tokens is not RWA
      const isNotRWA = await rwaRegistry.isRwaToken(tokens.addresses[1]);
      expect(isNotRWA).to.be.false;

      // check third tokens is not RWA
      const isNotRWA2 = await rwaRegistry.isRwaToken(tokens.addresses[2]);
      expect(isNotRWA2).to.be.false;

      // check fourth tokens is not RWA
      const isNotRWA3 = await rwaRegistry.isRwaToken(tokens.addresses[3]);
      expect(isNotRWA3).to.be.false;

      // expect nonce of sender to be increased
      const nonce = await factory.getNextNonce(deployer.address);
      expect(nonce).to.be.eq(1);
    });

    it('should not create an RWA pool successfully due to not having operator role', async function () {
      // const salt = ethers.utils.formatBytes32String('testSalt');
      const authorization = { operator: notOperator.address, v: v, r: r, s: s };

      await expect(factory.createRWAPool(params, deadline, salt, authorization)).to.be.revertedWith('BAL#435'); // INVALID_OPERATION
    });

    it('should not create an RWA pool successfully due to invalid signature', async function () {
      // const salt = ethers.utils.formatBytes32String('testSalt');
      const wrongR = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const wrongS = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const authorization = { operator: operatorAddress, v: v, r: wrongR, s: wrongS };

      await authorizer.connect(admin).grantRole(OPERATOR_ROLE, operatorAddress);
      await expect(factory.createRWAPool(params, deadline, salt, authorization)).to.be.revertedWith('BAL#504'); // INVALID_SIGNATURE
    });
    it('should create an RWA pool successfully if already added RWA token to RWARegistry', async () => {
      const nonce = await factory.getNextNonce(deployer.address);
      params.isRWA[0] = false;
      const structHash = await factory.getPoolCreationHash(params, deadline, nonce);

      const domainSeparator = await factory.getDomainSeparator();
      console.log('domainSeparator', domainSeparator);
      const encodedData = ethers.utils.solidityPack(
        ['bytes2', 'bytes32', 'bytes32'],
        ['0x1901', domainSeparator, structHash]
      );

      const digest = ethers.utils.keccak256(encodedData);

      const operatorWallet = new ethers.Wallet(operatorPk, ethers.provider);
      const signature = operatorWallet._signingKey().signDigest(digest);

      const splitSig = ethers.utils.splitSignature(signature);

      const authorization = { operator: operatorAddress, v: splitSig.v, r: splitSig.r, s: splitSig.s };
      await authorizer.connect(admin).grantRole(OPERATOR_ROLE, operator.address);
      await rwaRegistry.connect(operator).addToken(tokens.addresses[0]);
      await authorizer.connect(admin).grantRole(OPERATOR_ROLE, operatorAddress);

      const tx = await factory.createRWAPool(params, deadline, salt, authorization, { from: deployer.address });
      await expect(tx).to.emit(factory, 'PoolCreated');

      // check first tokens is RWA
      const isRWA = await rwaRegistry.isRwaToken(tokens.addresses[0]);
      expect(isRWA).to.be.true;

      // check second tokens is not RWA
      const isNotRWA = await rwaRegistry.isRwaToken(tokens.addresses[1]);
      expect(isNotRWA).to.be.false;

      // check third tokens is not RWA
      const isNotRWA2 = await rwaRegistry.isRwaToken(tokens.addresses[2]);
      expect(isNotRWA2).to.be.false;

      // check fourth tokens is not RWA
      const isNotRWA3 = await rwaRegistry.isRwaToken(tokens.addresses[3]);
      expect(isNotRWA3).to.be.false;
    });

    it('should create an RWA pool successfully if no tokens inputs are RWA tokens', async () => {
      const nonce = await factory.getNextNonce(deployer.address);
      params.isRWA[0] = false;
      const structHash = await factory.getPoolCreationHash(params, deadline, nonce);

      const domainSeparator = await factory.getDomainSeparator();
      const encodedData = ethers.utils.solidityPack(
        ['bytes2', 'bytes32', 'bytes32'],
        ['0x1901', domainSeparator, structHash]
      );

      const digest = ethers.utils.keccak256(encodedData);

      const operatorWallet = new ethers.Wallet(operatorPk, ethers.provider);
      const signature = operatorWallet._signingKey().signDigest(digest);

      const splitSig = ethers.utils.splitSignature(signature);

      const authorization = { operator: operatorAddress, v: splitSig.v, r: splitSig.r, s: splitSig.s };
      await authorizer.connect(admin).grantRole(OPERATOR_ROLE, operatorAddress);

      const tx = await factory.createRWAPool(params, deadline, salt, authorization, { from: deployer.address });
      await expect(tx).to.emit(factory, 'PoolCreated');

      // check first tokens is RWA
      const isRWA = await rwaRegistry.isRwaToken(tokens.addresses[0]);
      expect(isRWA).to.be.false;

      // check second tokens is not RWA
      const isNotRWA = await rwaRegistry.isRwaToken(tokens.addresses[1]);
      expect(isNotRWA).to.be.false;

      // check third tokens is not RWA
      const isNotRWA2 = await rwaRegistry.isRwaToken(tokens.addresses[2]);
      expect(isNotRWA2).to.be.false;

      // check fourth tokens is not RWA
      const isNotRWA3 = await rwaRegistry.isRwaToken(tokens.addresses[3]);
      expect(isNotRWA3).to.be.false;
    });
    it('should not create a pool with a wrong deadline', async () => {
      // const salt = ethers.utils.formatBytes32String('testSalt');
      deadline = 0;
      const nonce = await factory.getNextNonce(deployer.address);
      const structHash = await factory.getPoolCreationHash(params, deadline, nonce);

      const domainSeparator = await factory.getDomainSeparator();
      console.log('domainSeparator', domainSeparator);
      const encodedData = ethers.utils.solidityPack(
        ['bytes2', 'bytes32', 'bytes32'],
        ['0x1901', domainSeparator, structHash]
      );

      const digest = ethers.utils.keccak256(encodedData);

      const operatorWallet = new ethers.Wallet(operatorPk, ethers.provider);
      const signature = operatorWallet._signingKey().signDigest(digest);

      const splitSig = ethers.utils.splitSignature(signature);
      const authorization = { operator: operatorAddress, v: splitSig.v, r: splitSig.r, s: splitSig.s };

      await authorizer.connect(admin).grantRole(OPERATOR_ROLE, operatorAddress);
      await expect(factory.createRWAPool(params, deadline, salt, authorization)).to.be.revertedWith('BAL#440'); // EXPIRED_SIGNATURE
    });
  });
});
