import hre from 'hardhat';

async function main() {
  // const accounts = await hre.ethers.getSigners();

  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, get } = deployments;

  const { deployer } = await getNamedAccounts();
  console.log('Joining pool with the account:', deployer);

  const poolId = '0x51BF7FD6BC0D26AD74B62ED344DFEE4D755E6BF4000200000000000000000046';
  // const vaultAddress = '0xE2a21542102318BEeF6041299A937143a11A0c79'; // Replace with your vault address
  const vaultAddress = '0x7526fDfB5895c846c1f6833A58482e6293034978'; // Replace with your vault address
  const amount = ethers.utils.parseEther('1000'); // Amount to join the pool with

  // Get the Vault contract
  const Vault = await ethers.getContractFactory('Vault');
  const vault = await Vault.attach(vaultAddress);

  // Approve the Vault contract to spend the tokens
  const Token = await ethers.getContractFactory('ERC20');
  const token1 = await Token.attach('0x142953B2F88D0939FD9f48F4bFfa3A2BFa21e4F8');
  await token1.approve(vault.address, amount);
  const token2 = await Token.attach('0xA9c2c7D5E9bdA19bF9728384FFD3cF71Ada5dfcB');
  await token2.approve(vault.address, amount);

  // Define the assets and userData for the joinPool call
  const assets = ['0x142953B2F88D0939FD9f48F4bFfa3A2BFa21e4F8', '0xA9c2c7D5E9bdA19bF9728384FFD3cF71Ada5dfcB'];
  const maxAmountsIn = [amount, amount];
  const userData = ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'uint256[]'],
    [1, maxAmountsIn] // JOIN_KIND_INIT and maxAmountsIn
  );
  const fromInternalBalance = false;

  // get protocol fee collector contract
  const ProtocolFeesCollector = await ethers.getContractFactory('ProtocolFeesCollector');
  const protocolFeesAddress = await vault.getProtocolFeesCollector();
  const protocolFeesCollector = ProtocolFeesCollector.attach(protocolFeesAddress);

  console.log('protocolFeesCollector:', protocolFeesCollector.address);

  const authorizer = await vault.getAuthorizer();
  console.log('authorizer:', authorizer);
  const Authorizer = await ethers.getContractFactory('Authorizer');
  const authorizerContract = Authorizer.attach(authorizer);
  // await authorizerContract.grantPermission();
  


  
  // const BPT = await ethers.getContractFactory('WeightedPool');
  // const bpt = BPT.attach('0x39a038b3345Ca092688dC058e738E723D93ab280');
  // await bpt.setSwapFeePercentage(ethers.utils.parseEther('0.003'));

  // Join the pool
  await vault.joinPool(poolId, deployer, deployer, {
    assets,
    maxAmountsIn,
    userData,
    fromInternalBalance,
  });

  console.log('Successfully joined the pool');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
