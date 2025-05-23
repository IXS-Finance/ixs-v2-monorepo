import { ethers } from 'hardhat';
import { BigNumberish, Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { deploy } from '../../contract';
import { MONTH } from '../../time';
import { RawVaultDeployment, VaultDeployment } from './types';

import Vault from './Vault';
import TypesConverter from '../types/TypesConverter';
import TokensDeployer from '../tokens/TokensDeployer';
import { actionId } from '../misc/actions';
import RwaRegistry from '../rwaRegistry/RwaRegistry';

export default {
  async deploy(params: RawVaultDeployment): Promise<Vault> {
    const deployment = TypesConverter.toVaultDeployment(params);

    let { admin } = deployment;
    const { nextAdmin } = deployment;

    const { from, mocked } = deployment;
    if (!admin) admin = from || (await ethers.getSigners())[0];

    // This sequence breaks the circular dependency between authorizer, vault, adaptor and entrypoint.
    // First we deploy the vault, adaptor and entrypoint with a basic authorizer.
    const basicAuthorizer = await this._deployBasicAuthorizer(admin);
    const rwaRegistry = await RwaRegistry.create({ from, authorizer: basicAuthorizer.address });
    const vault = await (mocked ? this._deployMocked : this._deployReal)(
      deployment,
      basicAuthorizer,
      rwaRegistry.instance
    );
    const authorizerAdaptor = await this._deployAuthorizerAdaptor(vault, from);
    const adaptorEntrypoint = await this._deployAuthorizerAdaptorEntrypoint(authorizerAdaptor);
    const protocolFeeProvider = await this._deployProtocolFeeProvider(
      vault,
      deployment.maxYieldValue,
      deployment.maxAUMValue
    );
    const voter = await this._deployMockVoter();

    let authorizer;
    if (!params.useBasicAuthorizer) {
      // Then, with the entrypoint correctly deployed, we create the actual authorizer to be used and set it in the vault.
      authorizer = await this._deployAuthorizer(admin, adaptorEntrypoint, nextAdmin, from);
      const setAuthorizerActionId = await actionId(vault, 'setAuthorizer');
      const setAuthorizerActionIdForRwaRegistry = await actionId(rwaRegistry.instance, 'setAuthorizer');
      await basicAuthorizer.grantRolesToMany([setAuthorizerActionId], [admin.address]);
      await basicAuthorizer.grantRolesToMany([setAuthorizerActionIdForRwaRegistry], [admin.address]);
      await vault.connect(admin).setAuthorizer(authorizer.address);
      await rwaRegistry.instance.connect(admin).setAuthorizer(authorizer.address);
    } else {
      authorizer = basicAuthorizer;
    }

    return new Vault(
      mocked,
      vault,
      authorizer,
      authorizerAdaptor,
      rwaRegistry.instance,
      adaptorEntrypoint,
      protocolFeeProvider,
      admin,
      voter
    );
  },

  async _deployReal(deployment: VaultDeployment, authorizer: Contract, rwaRegistry: Contract): Promise<Contract> {
    const { from, pauseWindowDuration, bufferPeriodDuration } = deployment;
    const weth = await TokensDeployer.deployToken({ symbol: 'WETH' });

    const args = [authorizer.address, weth.address, rwaRegistry.address, pauseWindowDuration, bufferPeriodDuration];
    return deploy('v2-vault/Vault', { args, from });
  },

  async _deployMocked({ from }: VaultDeployment, authorizer: Contract): Promise<Contract> {
    return deploy('v2-pool-utils/MockVault', { from, args: [authorizer.address] });
  },

  async _deployBasicAuthorizer(admin: SignerWithAddress): Promise<Contract> {
    return deploy('v2-solidity-utils/MockBasicAuthorizer', { args: [], from: admin });
  },

  async _deployAuthorizer(
    admin: SignerWithAddress,
    authorizerAdaptorEntrypoint: Contract,
    nextAdmin: string,
    from?: SignerWithAddress
  ): Promise<Contract> {
    return deploy('v2-vault/TimelockAuthorizer', {
      args: [admin.address, nextAdmin, authorizerAdaptorEntrypoint.address, MONTH],
      from,
    });
  },

  async _deployAuthorizerAdaptor(vault: Contract, from?: SignerWithAddress): Promise<Contract> {
    return deploy('v2-liquidity-mining/AuthorizerAdaptor', { args: [vault.address], from });
  },

  async _deployAuthorizerAdaptorEntrypoint(adaptor: Contract, from?: SignerWithAddress): Promise<Contract> {
    return deploy('v2-liquidity-mining/AuthorizerAdaptorEntrypoint', { args: [adaptor.address], from });
  },

  async _deployProtocolFeeProvider(
    vault: Contract,
    maxYieldValue: BigNumberish,
    maxAUMValue: BigNumberish
  ): Promise<Contract> {
    return deploy('v2-standalone-utils/ProtocolFeePercentagesProvider', {
      args: [vault.address, maxYieldValue, maxAUMValue],
    });
  },

  async _deployMockVoter(from?: SignerWithAddress): Promise<Contract> {
    return deploy('v2-vault/MockVoter', { args: [], from });
  },
};
