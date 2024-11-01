import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  // Deploy the Authorizer contract
  const authorizer = await deploy('Authorizer', {
    from: deployer,
    args: [process.env.AUTHORIZER_ADMIN_ADDRESS], // if the constructor requires arguments, pass them here
    log: true,
  });

  console.log('Authorizer deployed to:', authorizer.address);
};

export default func;
func.tags = ['Authorizer'];
