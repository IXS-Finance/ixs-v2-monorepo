import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { run } from 'hardhat';

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
  await new Promise((res) => setTimeout(res, 30000));
  try {
    console.log('Verifying Authorizer...');
    await hre.run('verify:verify', {
      address: authorizer.address,
      constructorArguments: [process.env.AUTHORIZER_ADMIN_ADDRESS],
    });
    console.log('Verified Authorizer');
  } catch (error) {
    console.error('Verification failed:', error);
  }
};

export default func;
func.tags = ['Authorizer'];
