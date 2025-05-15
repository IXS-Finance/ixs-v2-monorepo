import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { utils } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;

  const { deployer } = await getNamedAccounts();

  const authorizer = await get('Authorizer');
  // Deploy the RwaRegistry contract
  const rwaRegistry = await deploy('RwaRegistry', {
    from: deployer,
    args: [authorizer.address],
    log: true,
  });

  console.log('RwaRegistry deployed to:', rwaRegistry.address);
  try {
    console.log('Verifying RwaRegistry...');
    await hre.run('verify:verify', {
      address: rwaRegistry.address,
      constructorArguments: [authorizer.address],
    });
    console.log('Verified RwaRegistry');
  } catch (error) {
    console.error('Verification failed:', error);
  }
};

export default func;
func.tags = ['RwaRegistry'];

func.dependencies = ['Authorizer'];
