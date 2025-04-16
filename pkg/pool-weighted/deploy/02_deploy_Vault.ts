import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { utils } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;

  const { deployer } = await getNamedAccounts();

  const PAUSE_WINDOW_DURATION = 7776000; // 3 months in seconds
  const BUFFER_PERIOD_DURATION = 2592000; // 1 month in seconds

  const authorizer = await get('Authorizer');
  const rwaRegistry = await get('RwaRegistry');
  // const testWETH = await get('TestWETH');
  const testWETH = process.env.WETH;

  // Deploy the Vault contract
  const vault = await deploy('Vault', {
    from: deployer,
    args: [authorizer.address, testWETH, rwaRegistry.address, PAUSE_WINDOW_DURATION, BUFFER_PERIOD_DURATION], // if the constructor requires arguments, pass them here
    // use create2 deploy an identical address to multiple chains
    // this is required by sdk for some contracts
    deterministicDeployment: utils.formatBytes32String(process.env.VAULT_DEPLOYMENT_SALT as string),
    log: true,
  });

  console.log('Vault deployed to:', vault.address);
  await new Promise((res) => setTimeout(res, 30000));

  try {
    console.log('Verifying vault...');
    await hre.run('verify:verify', {
      address: vault.address,
      constructorArguments: [
        authorizer.address,
        testWETH,
        rwaRegistry.address,
        PAUSE_WINDOW_DURATION,
        BUFFER_PERIOD_DURATION,
      ],
    });
    console.log('Verified vault');
  } catch (error) {
    console.error('Verification failed:', error);
  }

  // const Vault = await get('Vault');
  const vaultIns = await hre.ethers.getContractAt('IVault', vault.address);
  const poolFeesAddress = await vaultIns.getPoolFeesCollector();
  console.log('PoolFees deployed to:', poolFeesAddress);

  try {
    console.log('Verifying PoolFees with etherscan...');
    await hre.run('verify:verify', {
      address: poolFeesAddress,
      constructorArguments: [vault.address],
    });
    console.log('Verified PoolFees with etherscan');
  } catch (error) {
    console.error('Verification failed:', error);
  }
};

export default func;
func.tags = ['Vault'];

func.dependencies = ['Authorizer', 'RwaRegistry'];
