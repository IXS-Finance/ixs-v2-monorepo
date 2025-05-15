// deploy/deploy_test_tokens.ts

import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const tokens = [
    { name: 'Test Token', symbol: 'TTT', decimals: 18, deploymentName: 'TestToken1' },
    { name: 'Test Token 2', symbol: 'TTT2', decimals: 18, deploymentName: 'TestToken2' },
  ];

  for (const token of tokens) {
    const deployedToken = await deploy(token.deploymentName, {
      contract: 'TestToken',
      from: deployer,
      args: [token.name, token.symbol, token.decimals],
      log: true,
    });
    console.log(`${token.deploymentName} deployed to:`, deployedToken.address);
  }
};

export default func;
func.tags = ['TestTokens'];
