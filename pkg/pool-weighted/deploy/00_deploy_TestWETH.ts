import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  // Deploy the TestWETH contract
  const testWETH = await deploy('TestWETH', {
    from: deployer,
    args: [], // if the constructor requires arguments, pass them here
    log: true,
  });

  console.log('TestWETH deployed to:', testWETH.address);
};

export default func;
func.tags = ['TestWETH'];
