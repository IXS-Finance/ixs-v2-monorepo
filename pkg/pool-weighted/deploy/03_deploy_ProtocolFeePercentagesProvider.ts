import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { utils } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;

  const { deployer } = await getNamedAccounts();

  // Set max yield and AUM values to 50% in fixed-point representation (50% = 0.5 * 1e18)
  const MAX_YIELD_VALUE = 500000000000000000n; // 50% as BigInt
  const MAX_AUM_VALUE = 500000000000000000n; // 50% as BigInt
  const vault = await get('Vault');
  // Deploy the ProtocolFeePercentagesProvider contract
  const protocolFeePercentagesProvider = await deploy('ProtocolFeePercentagesProvider', {
    from: deployer,
    args: [vault.address, MAX_YIELD_VALUE, MAX_AUM_VALUE],
    log: true,
    deterministicDeployment: utils.formatBytes32String(process.env.PROTOCOL_FEE_PERCENTAGES_PROVIDER_SALT as string),
  });

  console.log('ProtocolFeePercentagesProvider deployed to:', protocolFeePercentagesProvider.address);
  await new Promise((res) => setTimeout(res, 30000));

  try {
    console.log('Verifying ProtocolFeePercentagesProvider...');
    await hre.run('verify:verify', {
      address: protocolFeePercentagesProvider.address,
      constructorArguments: [vault.address, MAX_YIELD_VALUE, MAX_AUM_VALUE],
    });
    console.log('Verified ProtocolFeePercentagesProvider');
  } catch (error) {
    console.error('Verification failed:', error);
  }
};

export default func;
func.tags = ['ProtocolFeePercentagesProvider'];

func.dependencies = ['Vault'];
