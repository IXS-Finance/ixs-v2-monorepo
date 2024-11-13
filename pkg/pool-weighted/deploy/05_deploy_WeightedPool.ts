// deploy/deploy_weighted_pool.ts

import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, get } = deployments;

  const { deployer } = await getNamedAccounts();

  // Configuration Constants
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const TOKEN_NAME = 'My Weighted Pool';
  const TOKEN_SYMBOL = 'MWP';
  const WEIGHT_1 = ethers.BigNumber.from('800000000000000000'); // 80% weight
  const WEIGHT_2 = ethers.BigNumber.from('200000000000000000'); // 20% weight
  const SWAP_FEE_PERCENTAGE = ethers.BigNumber.from('1000000000000'); // 0.01% swap fee
  const OWNER_ADDRESS = deployer; // Owner of the WeightedPool
  const SALT = ethers.utils.id(`WeightedPoolSalt-${Date.now()}`); // Unique salt for CREATE2

  // Helper Function to Sort Tokens by Address
  function sortTokens(tokens: string[]): string[] {
    return tokens.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }

  // Fetch Deployed Dependencies
  const vault = await get('Vault');
  const protocolFeePercentagesProvider = await get('ProtocolFeePercentagesProvider');
  const testToken1 = await get('TestToken1');
  const testToken2 = await get('TestToken2');

  // Verify that TestToken1 and TestToken2 are deployed
  const testToken1Code = await ethers.provider.getCode(testToken1.address);
  const testToken2Code = await ethers.provider.getCode(testToken2.address);

  if (testToken1Code === '0x') {
    throw new Error(`TestToken1 contract not found at address: ${testToken1.address}`);
  }

  if (testToken2Code === '0x') {
    throw new Error(`TestToken2 contract not found at address: ${testToken2.address}`);
  }

  // Pool Parameters
  const poolParams = {
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    tokens: [testToken1.address, testToken2.address], // Use deployed token addresses
    normalizedWeights: [WEIGHT_1, WEIGHT_2],
    rateProviders: [ZERO_ADDRESS, ZERO_ADDRESS], // No rate providers
    // assetManagers are handled internally by the factory (set to ZERO_ADDRESS)
    swapFeePercentage: SWAP_FEE_PERCENTAGE,
  };

  // Sort the tokens
  const sortedTokens = sortTokens(poolParams.tokens);
  poolParams.tokens = sortedTokens;

  // Verify Vault and ProtocolFeePercentagesProvider are deployed
  const vaultCode = await ethers.provider.getCode(vault.address);
  const feeProviderCode = await ethers.provider.getCode(protocolFeePercentagesProvider.address);

  if (vaultCode === '0x') {
    throw new Error(`Vault contract not found at address: ${vault.address}`);
  }

  if (feeProviderCode === '0x') {
    throw new Error(
      `ProtocolFeePercentagesProvider contract not found at address: ${protocolFeePercentagesProvider.address}`
    );
  }

  // Fetch already deployed WeightedPoolFactory
  const weightedPoolFactoryDeployment = await get('WeightedPoolFactory');
  const weightedPoolFactory = await ethers.getContractAt('WeightedPoolFactory', weightedPoolFactoryDeployment.address);
  console.log('WeightedPoolFactory found at:', weightedPoolFactory.address);

  // Prepare Arguments for create Function
  const name = poolParams.name;
  const symbol = poolParams.symbol;
  const tokens: string[] = poolParams.tokens.map((token) => ethers.utils.getAddress(token)); // Ensure checksum
  const normalizedWeights: ethers.BigNumber[] = poolParams.normalizedWeights; // Already BigNumbers
  const rateProviders: string[] = poolParams.rateProviders.map((rp) => ethers.utils.getAddress(rp)); // Zero addresses
  const swapFeePercentage = poolParams.swapFeePercentage;
  const owner = OWNER_ADDRESS;
  const salt = SALT;

  // Deploy WeightedPool via WeightedPoolFactory
  console.log('Creating WeightedPool via WeightedPoolFactory...');
  const tx = await weightedPoolFactory.create(
    name,
    symbol,
    tokens,
    normalizedWeights,
    rateProviders,
    swapFeePercentage,
    owner,
    salt
  );

  console.log('Transaction sent. Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('Transaction confirmed.');

  // Parse PoolCreated Event to Retrieve WeightedPool Address
  // Ensure that WeightedPoolFactory emits a PoolCreated(address pool) event
  const poolCreatedEvent = weightedPoolFactory.interface.getEvent('PoolCreated');
  const poolCreatedTopic = weightedPoolFactory.interface.getEventTopic(poolCreatedEvent);

  let poolAddress: string | undefined;

  for (const log of receipt.logs) {
    if (log.topics[0] === poolCreatedTopic) {
      const parsedLog = weightedPoolFactory.interface.parseLog(log);
      poolAddress = parsedLog.args.pool;
      break;
    }
  }

  if (!poolAddress) {
    console.error('PoolCreated event not found. Unable to retrieve WeightedPool address.');
    return;
  }

  console.log('WeightedPool deployed to:', poolAddress);
};

export default func;
func.tags = ['WeightedPool'];
func.dependencies = ['TestTokens', 'Vault', 'ProtocolFeePercentagesProvider', 'WeightedPoolFactory'];
