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
  const testWETH = await get('TestWETH');
  // Deploy the Vault contract
  const vault = await deploy('Vault', {
    from: deployer,
    args: [authorizer.address, testWETH.address, PAUSE_WINDOW_DURATION, BUFFER_PERIOD_DURATION], // if the constructor requires arguments, pass them here
    // use create2 deploy an identical address to multiple chains
    // this is required by sdk for some contracts
    deterministicDeployment: utils.formatBytes32String(process.env.VAULT_DEPLOYMENT_SALT as string),
    log: true,
  });

  console.log('Vault deployed to:', vault.address);
};

export default func;
func.tags = ['Vault'];

func.dependencies = ['TestWETH', 'Authorizer'];
