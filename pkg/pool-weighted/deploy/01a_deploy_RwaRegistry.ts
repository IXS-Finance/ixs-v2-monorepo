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
};

export default func;
func.tags = ['RwaRegistry'];

func.dependencies = ['Authorizer'];
