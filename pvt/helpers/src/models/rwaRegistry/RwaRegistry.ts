// models/RwaRegistry.ts

import { Contract, ContractTransaction } from 'ethers';
import { BigNumberish } from 'ethers';
import { Interface } from '@ethersproject/abi';

import { TxParams } from '../types/types';
import { RwaAuthorizationData, RwaRegistryDeployment } from './types';
import RwaRegistryDeployer from './RwaRegistryDeployer';

export default class RwaRegistry {
  instance: Contract;

  /**
   * Creates a new instance of RwaRegistry by deploying the contract.
   * @param deployment - Deployment parameters.
   * @returns A Promise that resolves to an instance of RwaRegistry.
   */
  static async create(deployment: RwaRegistryDeployment = {}): Promise<RwaRegistry> {
    return RwaRegistryDeployer.deploy(deployment);
  }

  constructor(instance: Contract) {
    this.instance = instance;
  }

  get address(): string {
    return this.instance.address;
  }

  get interface(): Interface {
    return this.instance.interface;
  }

  /**
   * Adds a token to the RWA registry.
   * @param tokenAddress - The address of the token to add.
   * @param txParams - Transaction parameters (e.g., sender).
   */
  async addToken(tokenAddress: string, txParams: TxParams = {}): Promise<ContractTransaction> {
    const from = txParams.from;
    const instance = from ? this.instance.connect(from) : this.instance;
    return instance.addToken(tokenAddress);
  }

  /**
   * Removes a token from the RWA registry.
   * @param tokenAddress - The address of the token to remove.
   * @param txParams - Transaction parameters (e.g., sender).
   */
  async removeToken(tokenAddress: string, txParams: TxParams = {}): Promise<ContractTransaction> {
    const from = txParams.from;
    const instance = from ? this.instance.connect(from) : this.instance;
    return instance.removeToken(tokenAddress);
  }

  /**
   * Checks if a token is an RWA token.
   * @param tokenAddress - The address of the token to check.
   */
  async isRwaToken(tokenAddress: string): Promise<boolean> {
    return this.instance.isRwaToken(tokenAddress);
  }

  /**
   * Checks if a swap involves RWA tokens.
   * @param assetIn - The address of the input asset.
   * @param assetOut - The address of the output asset.
   */
  async isRwaSwap(assetIn: string, assetOut: string): Promise<void> {
    return this.instance.isRwaSwap(assetIn, assetOut);
  }

  /**
   * Checks if a swap does not involve RWA tokens.
   * @param assetIn - The address of the input asset.
   * @param assetOut - The address of the output asset.
   */
  async isNotRwaSwap(assetIn: string, assetOut: string): Promise<void> {
    return this.instance.isNotRwaSwap(assetIn, assetOut);
  }

  /**
   * Checks if a batch swap involves RWA tokens.
   * @param assets - The array of asset addresses involved in the swap.
   */
  async isRwaBatchSwap(assets: string[]): Promise<void> {
    return this.instance.isRwaBatchSwap(assets);
  }

  /**
   * Checks if a batch swap does not involve RWA tokens.
   * @param assets - The array of asset addresses involved in the swap.
   */
  async isNotRwaBatchSwap(assets: string[]): Promise<void> {
    return this.instance.isNotRwaBatchSwap(assets);
  }

  /**
   * Verifies the RWA swap signature.
   * @param to - The recipient address.
   * @param authorization - The RWA authorization data.
   * @param deadline - The deadline timestamp.
   * @param authorizer - The address of the authorizer contract.
   * @param domainSeparatorV4 - The EIP-712 domain separator.
   * @param txParams - Transaction parameters (e.g., sender).
   */
  async verifyRwaSwapSignature(
    to: string,
    authorization: RwaAuthorizationData,
    deadline: BigNumberish,
    authorizer: string,
    domainSeparatorV4: string,
    txParams: TxParams = {}
  ): Promise<ContractTransaction> {
    const from = txParams.from;
    const instance = from ? this.instance.connect(from) : this.instance;
    return instance.verifyRwaSwapSignature(to, authorization, deadline, authorizer, domainSeparatorV4);
  }

  /**
   * Gets the next nonce for a given operator and account.
   * @param operator - The operator address.
   * @param account - The account address.
   */
  async getNextNonceByOperator(operator: string, account: string): Promise<BigNumberish> {
    return this.instance.getNextNonceByOperator(operator, account);
  }
}
