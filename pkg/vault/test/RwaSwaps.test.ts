import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Dictionary } from 'lodash';
import { BigNumber, Contract, ContractReceipt } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import TokenList, { ETH_TOKEN_ADDRESS } from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import { actionId } from '@balancer-labs/v2-helpers/src/models/misc/actions';
import { encodeJoin } from '@balancer-labs/v2-helpers/src/models/pools/mockPool';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { Comparison, expectBalanceChange } from '@balancer-labs/v2-helpers/src/test/tokenBalance';
import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';

import {
  BatchSwapStep,
  FundManagement,
  SingleSwap,
  SwapKind,
  RwaAuthorizationData,
  RwaSingleSwap,
  RwaBatchSwap,
  PoolSpecialization,
  RelayerAuthorization,
  RwaBatchSwapStep,
} from '@balancer-labs/balancer-js';
import { deploy, deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import { BigNumberish, bn, fp, FP_ONE } from '@balancer-labs/v2-helpers/src/numbers';
import {
  ANY_ADDRESS,
  MAX_GAS_LIMIT,
  MAX_INT256,
  MAX_UINT112,
  MAX_UINT256,
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from '@balancer-labs/v2-helpers/src/constants';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';
import VaultDeployer from '@balancer-labs/v2-helpers/src/models/vault/VaultDeployer';
import TypesConverter from '@balancer-labs/v2-helpers/src/models/types/TypesConverter';

type SwapData = {
  pool?: number; // Index in the poolIds array
  amount: number | BigNumber;
  in: number; // Index in the tokens array
  out: number; // Index in the tokens array
  data?: string;
  fromOther?: boolean;
  toOther?: boolean;
};

type SwapInput = {
  swaps: SwapData[];
  fromOther?: boolean;
  toOther?: boolean;
  signature?: boolean | string;
};
type RwaSwapInput = {
  swaps: SwapData[];
  fromOther?: boolean;
  toOther?: boolean;
  signature?: boolean | string;
  authorization: RwaAuthorizationData;
  deadline?: number;
};

type TestTokenObject = {
  symbol: string;
  index: number;
};

describe('RwaSwaps', () => {
  let vault: Contract, authorizer: Contract, funds: FundManagement, emptyAuthorization: RwaAuthorizationData;
  let tokens: TokenList;
  let mainPoolId: string, secondaryPoolId: string;
  let lp: SignerWithAddress,
    trader: SignerWithAddress,
    trader2: SignerWithAddress,
    other: SignerWithAddress,
    admin: SignerWithAddress;

  const poolInitialBalance = bn(50e18);
  before('setup', async () => {
    [, lp, trader, trader2, other, admin] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy vault and tokens', async () => {
    tokens = await TokenList.create(['DAI', 'MKR', 'RWATT', 'RWATT2']);

    ({ instance: vault, authorizer } = await Vault.create({ admin }));

    // Contortions required to get the Vault's version of WETH to be in tokens
    const wethContract = await deployedAt('v2-standalone-utils/TestWETH', await vault.WETH());
    // And also need a real Token, in order to call mint
    const wethToken = new Token('Wrapped Ether', 'WETH', 18, wethContract);
    tokens.tokens.push(wethToken);
    tokens = new TokenList(tokens.tokens);

    await tokens.mint({ to: [lp, trader, trader2], amount: bn(200e18) });
    await tokens.approve({ to: vault, from: [lp, trader, trader2], amount: MAX_UINT112 });
  });

  beforeEach('set up default sender', async () => {
    funds = {
      sender: trader.address,
      recipient: trader.address,
      fromInternalBalance: false,
      toInternalBalance: false,
    };
  });
  context('swaps function should throw error if one of tokens is RWA token', () => {
    context('with two tokens. one of them is RWA token. the other is ERC20 token', () => {
      const testTokenList = [
        { symbol: 'DAI', index: 0 },
        { symbol: 'RWATT', index: 2 },
      ];

      context('with a general pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.GeneralPool, testTokenList);
      });

      context('with a minimal swap info pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.MinimalSwapInfoPool, testTokenList);
      });

      context('with a two token pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.TwoTokenPool, testTokenList);
      });
    });
    context('with two tokens. All of them are RWA tokens', () => {
      const testTokenList = [
        { symbol: 'RWATT', index: 2 },
        { symbol: 'RWATT2', index: 3 },
      ];

      context('with a general pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.GeneralPool, testTokenList);
      });

      context('with a minimal swap info pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.MinimalSwapInfoPool, testTokenList);
      });

      context('with a two token pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.TwoTokenPool, testTokenList);
      });
    });
  });

  context('rwaSwaps function should throw error', () => {
    context('if none of tokens are RWA tokens', () => {
      const testTokenList = [
        { symbol: 'DAI', index: 0 },
        { symbol: 'MKR', index: 1 },
      ];
      const emptyAuthorization = {
        operator: ethers.constants.AddressZero,
        v: 0,
        r: ethers.constants.HashZero,
        s: ethers.constants.HashZero,
      };
      const swaps = [{ in: testTokenList[0].index, out: testTokenList[1].index, amount: 1e18 }];
      itThrowsErrorForInvalidRwaSwapsArgs(testTokenList, { swaps, authorization: emptyAuthorization }, 'INVALID_TOKEN');
    });

    context('one of tokens is RWA tokens', () => {
      const testTokenList = [
        { symbol: 'DAI', index: 0 },
        { symbol: 'RWATT', index: 2 },
      ];
      const emptyAuthorization = {
        operator: ethers.constants.AddressZero,
        v: 0,
        r: ethers.constants.HashZero,
        s: ethers.constants.HashZero,
      };
      const swaps = [{ in: testTokenList[0].index, out: testTokenList[1].index, amount: 1e18 }];
      context('operator is not authorized', () => {
        itThrowsErrorForInvalidRwaSwapsArgs(
          testTokenList,
          {
            swaps,
            authorization: {
              operator: '0xbA54cAA3ac52C416AfB461A07aec1744C08462e5',
              v: 0,
              r: ethers.constants.HashZero,
              s: ethers.constants.HashZero,
            },
          },
          'SENDER_NOT_ALLOWED'
        );
      });
      context('when rwa operator is set', () => {
        const operatorAddress = '0xbA54cAA3ac52C416AfB461A07aec1744C08462e5';
        sharedBeforeEach('set rwa operator', async () => {
          const operatorRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('OPERATOR_ROLE'));

          await authorizer.connect(admin).grantPermission(operatorRole, operatorAddress, ANY_ADDRESS);
        });
        context('it should throw an error when the signature is invalid', () => {
          const invalidAuthorization = {
            operator: operatorAddress,
            v: 0,
            r: ethers.constants.HashZero,
            s: ethers.constants.HashZero,
          };
          itThrowsErrorForInvalidRwaSwapsArgs(
            testTokenList,
            { swaps, authorization: invalidAuthorization },
            'INVALID_SIGNATURE'
          );
        });
        context('Testing signature logics', () => {
          let v: number;
          let r: string;
          let s: string;
          const operatorPk = '0x59c6995e998f97a5a00467e6c7e82d306fb1c0d9ca5864f27fe0b0ec4f42e693';
          const operatorAddress = '0x1Df5CE618C4760F4a277B4BCc97853671Cec8F4c';
          sharedBeforeEach('set up signature', async () => {
            const operatorRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('OPERATOR_ROLE'));

            await authorizer.connect(admin).grantPermission(operatorRole, operatorAddress, ANY_ADDRESS);
            const _SWAP_TYPE_HASH = '0xe192dcbc143b1e244ad73b813fd3c097b832ad260a157340b4e5e5beda067abe';
            const to = funds.recipient;
            const nonce = await vault.connect(lp).getNextNonceByOperator(operatorAddress, to);
            const deadline = MAX_INT256;

            const structHash = ethers.utils.keccak256(
              ethers.utils.defaultAbiCoder.encode(
                ['bytes32', 'address', 'address', 'uint256', 'uint256'], // Types: _SWAP_TYPE_HASH, operator, to, nonce, deadline
                [_SWAP_TYPE_HASH, operatorAddress, to, nonce, deadline] // Values
              )
            );

            const domainSeparator = await vault.connect(lp).getDomainSeparator();
            const encodedData = ethers.utils.solidityPack(
              ['bytes2', 'bytes32', 'bytes32'],
              ['0x1901', domainSeparator, structHash]
            );

            const digest = ethers.utils.keccak256(encodedData);
            // const signature = await admin.signMessage(ethers.utils.arrayify(digest));

            const operatorWallet = new ethers.Wallet(operatorPk, ethers.provider);

            const signature = operatorWallet._signingKey().signDigest(digest);

            const splitSig = ethers.utils.splitSignature(signature);
            v = splitSig.v;
            r = splitSig.r;
            s = splitSig.s;

            // Output the components
          });
          it('should pass _verifyRwaSwapSignature', async () => {
            mainPoolId = await deployPool(
              PoolSpecialization.GeneralPool,
              testTokenList.map((v) => v.symbol)
            );

            const authorization = {
              operator: operatorAddress,
              v,
              r,
              s,
            };
            const input = { swaps };
            const sender = trader;
            const swap = toSingleSwap(SwapKind.GivenOut, input);
            const call = vault.connect(sender).rwaSwap(swap, funds, MAX_INT256, MAX_INT256, authorization);
            await expect(call).to.not.be.reverted;
          });

          it('should fail if reuse signature for another swap', async () => {
            mainPoolId = await deployPool(
              PoolSpecialization.GeneralPool,
              testTokenList.map((v) => v.symbol)
            );

            const authorization = {
              operator: operatorAddress,
              v,
              r,
              s,
            };
            const input = { swaps };
            const sender = trader;
            const swap = toSingleSwap(SwapKind.GivenOut, input);
            let call = vault.connect(sender).rwaSwap(swap, funds, MAX_INT256, MAX_INT256, authorization);
            await expect(call).to.not.be.reverted;
            call = vault.connect(sender).rwaSwap(swap, funds, MAX_INT256, MAX_INT256, authorization);
            await expect(call).to.be.revertedWith('INVALID_SIGNATURE');
          });

          it('should fail if tarder2 use signature generated for trader1 to swap', async () => {
            mainPoolId = await deployPool(
              PoolSpecialization.GeneralPool,
              testTokenList.map((v) => v.symbol)
            );

            const authorization = {
              operator: operatorAddress,
              v,
              r,
              s,
            };
            const input = { swaps };
            const sender = trader;

            // Clone and modify original funds
            const _funds = { ...funds };
            _funds.recipient = trader2.address;
            const swap = toSingleSwap(SwapKind.GivenOut, input);
            const call = vault.connect(sender).rwaSwap(swap, _funds, MAX_INT256, MAX_INT256, authorization);
            await expect(call).to.be.revertedWith('INVALID_SIGNATURE');
          });
        });
      });
    });
  });

  function toBatchSwap(input: SwapInput): BatchSwapStep[] {
    return input.swaps.map((data) => ({
      poolId: ((data.pool ?? 0) == 0 ? mainPoolId : secondaryPoolId) || ZERO_BYTES32,
      amount: data.amount.toString(),
      assetInIndex: data.in,
      assetOutIndex: data.out,
      userData: data.data ?? '0x',
    }));
  }
  function toRwaBatchSwap(input: RwaSwapInput): RwaBatchSwapStep[] {
    return input.swaps.map((data) => ({
      poolId: ((data.pool ?? 0) == 0 ? mainPoolId : secondaryPoolId) || ZERO_BYTES32,
      amount: data.amount.toString(),
      assetInIndex: data.in,
      assetOutIndex: data.out,
      userData: data.data ?? '0x',
      authorization: input.authorization,
    }));
  }

  function toSingleSwap(kind: SwapKind, input: SwapInput): SingleSwap {
    const data = toBatchSwap(input)[0];
    return {
      kind,
      poolId: data.poolId,
      amount: data.amount,
      assetIn: tokens.addresses[data.assetInIndex] || ZERO_ADDRESS,
      assetOut: tokens.addresses[data.assetOutIndex] || ZERO_ADDRESS,
      userData: data.userData,
    };
  }
  function toSingleRwaSwap(kind: SwapKind, input: RwaSwapInput): RwaSingleSwap {
    const data = toRwaBatchSwap(input)[0];
    return {
      kind,
      poolId: data.poolId,
      amount: data.amount,
      assetIn: tokens.addresses[data.assetInIndex] || ZERO_ADDRESS,
      assetOut: tokens.addresses[data.assetOutIndex] || ZERO_ADDRESS,
      userData: data.userData,
      authorization: input.authorization,
    };
  }

  async function deployPool(specialization: PoolSpecialization, tokenSymbols: string[]): Promise<string> {
    const pool = await deploy('MockPool', { args: [vault.address, specialization] });
    await pool.setMultiplier(fp(2));

    // Register tokens
    const sortedTokenAddresses = tokenSymbols
      .map((symbol) => tokens.findBySymbol(symbol))
      .sort((tokenA, tokenB) => tokenA.compare(tokenB))
      .map((token) => token.address);

    const assetManagers = sortedTokenAddresses.map(() => ZERO_ADDRESS);

    await pool.connect(lp).registerTokens(sortedTokenAddresses, assetManagers);

    // Join the pool - the actual amount is not relevant since the MockPool relies on the multiplier to calculate prices
    const tokenAmounts = sortedTokenAddresses.map(() => poolInitialBalance);

    const poolId = pool.getPoolId();
    await vault.connect(lp).joinPool(poolId, lp.address, other.address, {
      assets: sortedTokenAddresses,
      maxAmountsIn: tokenAmounts,
      fromInternalBalance: false,
      userData: encodeJoin(tokenAmounts, Array(sortedTokenAddresses.length).fill(0)),
    });

    return poolId;
  }

  function deployMainPool(specialization: PoolSpecialization, tokenSymbols: string[]) {
    sharedBeforeEach('deploy main pool', async () => {
      mainPoolId = await deployPool(specialization, tokenSymbols);
    });
  }

  function itHandlesSwapsProperly(specialization: PoolSpecialization, testTokenList: TestTokenObject[]) {
    deployMainPool(
      specialization,
      testTokenList.map((v) => v.symbol)
    );
    const assertSwapGivenInReverts = (input: SwapInput, defaultReason?: string, singleSwapReason = defaultReason) => {
      const isSingleSwap = input.swaps.length === 1;

      if (isSingleSwap) {
        it(`reverts ${isSingleSwap ? '(single)' : ''}`, async () => {
          const sender = input.fromOther ? other : trader;
          const swap = toSingleSwap(SwapKind.GivenIn, input);
          const call = vault.connect(sender).swap(swap, funds, 0, MAX_UINT256);

          singleSwapReason
            ? await expect(call).to.be.revertedWith(singleSwapReason)
            : await expect(call).to.be.reverted;
        });
      }

      // it(`reverts ${isSingleSwap ? '(batch)' : ''}`, async () => {
      //   const sender = input.fromOther ? other : trader;
      //   const swaps = toBatchSwap(input);

      //   const limits = Array(tokens.length).fill(MAX_INT256);
      //   const deadline = MAX_UINT256;

      //   const call = vault
      //     .connect(sender)
      //     .batchSwap(SwapKind.GivenIn, swaps, tokens.addresses, funds, limits, deadline);
      //   defaultReason ? await expect(call).to.be.revertedWith(defaultReason) : await expect(call).to.be.reverted;
      // });
    };

    context('for a single swap', () => {
      context('normal token order', () => {
        const swaps = [{ in: testTokenList[0].index, out: testTokenList[1].index, amount: 1e18 }];
        assertSwapGivenInReverts({ swaps }, 'INVALID_TOKEN');
      });
      context('reverse token order', () => {
        const swaps = [{ in: testTokenList[1].index, out: testTokenList[0].index, amount: 1e18 }];
        assertSwapGivenInReverts({ swaps }, 'INVALID_TOKEN');
      });
    });
  }

  function itThrowsErrorForInvalidRwaSwapsArgs(testTokenList: TestTokenObject[], input: RwaSwapInput, reason: string) {
    const assertRwaSwapGivenInReverts = (
      input: RwaSwapInput,
      defaultReason?: string,
      singleSwapReason = defaultReason
    ) => {
      const isSingleSwap = input.swaps.length === 1;

      if (isSingleSwap) {
        it(`reverts ${isSingleSwap ? '(single)' : ''}`, async () => {
          const sender = input.fromOther ? other : trader;
          const swap = toSingleRwaSwap(SwapKind.GivenIn, input);
          const call = vault
            .connect(sender)
            .rwaSwap(swap, funds, 0, input.deadline || MAX_UINT256, input.authorization);

          singleSwapReason
            ? await expect(call).to.be.revertedWith(singleSwapReason)
            : await expect(call).to.be.reverted;
        });
      }

      // it(`reverts ${isSingleSwap ? '(batch)' : ''}`, async () => {
      //   const sender = input.fromOther ? other : trader;
      //   const swaps = toBatchSwap(input);

      //   const limits = Array(tokens.length).fill(MAX_INT256);
      //   const deadline = MAX_UINT256;

      //   const call = vault
      //     .connect(sender)
      //     .batchSwap(SwapKind.GivenIn, swaps, tokens.addresses, funds, limits, deadline);
      //   defaultReason ? await expect(call).to.be.revertedWith(defaultReason) : await expect(call).to.be.reverted;
      // });
    };
    context('with two tokens', () => {
      context('with a general pool', () => {
        deployMainPool(
          PoolSpecialization.GeneralPool,
          testTokenList.map((v) => v.symbol)
        );
        assertRwaSwapGivenInReverts(input, reason);
      });

      context('with a minimal swap info pool', () => {
        deployMainPool(
          PoolSpecialization.MinimalSwapInfoPool,
          testTokenList.map((v) => v.symbol)
        );
        assertRwaSwapGivenInReverts(input, reason);
      });

      context('with a two token pool', () => {
        deployMainPool(
          PoolSpecialization.TwoTokenPool,
          testTokenList.map((v) => v.symbol)
        );
        assertRwaSwapGivenInReverts(input, reason);
      });
    });
  }
});
