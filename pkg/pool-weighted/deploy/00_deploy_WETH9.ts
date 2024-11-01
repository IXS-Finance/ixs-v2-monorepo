import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  // Deploy the WETH9 contract
  const weth9 = await deploy('WETH9', {
    from: deployer,
    args: [], // if the constructor requires arguments, pass them here
    log: true,
  });

  console.log('WETH9 deployed to:', weth9.address);
};

export default func;
func.tags = ['WETH9'];
