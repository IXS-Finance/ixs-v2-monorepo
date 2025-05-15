import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { utils } from 'ethers';
import RwaRegistry from '../../../pvt/helpers/src/models/rwaRegistry/RwaRegistry';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;

  const { deployer } = await getNamedAccounts();

  // Define pause window and buffer period durations (3 months and 1 month in seconds)
  const PAUSE_WINDOW_DURATION = 7776000; // 3 months in seconds (90 days)
  const BUFFER_PERIOD_DURATION = 2592000; // 1 month in seconds (30 days)
  const vault = await get('Vault');
  const protocolFeePercentagesProvider = await get('ProtocolFeePercentagesProvider');
  // Deploy the WeightedPoolFactory contract
  const authorizer = await get('Authorizer');
  const RwaRegistry = await get('RwaRegistry');
  const weightedPoolFactory = await deploy('WeightedPoolFactory', {
    from: deployer,
    args: [vault.address, protocolFeePercentagesProvider.address, PAUSE_WINDOW_DURATION, BUFFER_PERIOD_DURATION, authorizer.address, RwaRegistry.address],
    log: true,
    deterministicDeployment: utils.formatBytes32String(process.env.WEIGHTED_POOL_FACTORY_SALT as string),
  });

  console.log('WeightedPoolFactory deployed to:', weightedPoolFactory.address);
  await new Promise((res) => setTimeout(res, 30000));
  try {
    console.log('Verifying WeightedPoolFactory...');
    await hre.run('verify:verify', {
      address: weightedPoolFactory.address,
      constructorArguments: [
        vault.address,
        protocolFeePercentagesProvider.address,
        PAUSE_WINDOW_DURATION,
        BUFFER_PERIOD_DURATION,
        authorizer.address,
        RwaRegistry.address,
      ],
    });
    console.log('Verified WeightedPoolFactory');
  } catch (error) {
    console.error('Verification failed:', error);
  }
};

export default func;
func.tags = ['WeightedPoolFactory'];

func.dependencies = ['Vault', 'ProtocolFeePercentagesProvider'];
