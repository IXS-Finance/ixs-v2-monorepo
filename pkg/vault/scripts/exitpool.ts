import hre from 'hardhat';

async function main() {
  // const accounts = await hre.ethers.getSigners();

  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, get } = deployments;

  const { deployer } = await getNamedAccounts();
  console.log('Joining pool with the account:', deployer);

  const poolId = '0x39A038B3345CA092688DC058E738E723D93AB280000200000000000000000000';
  const vaultAddress = '0xF40AC6566b5590aDA95c7a0e422b11ee2740ac0a'; // Replace with your vault address

  // Get the Vault contract
  const Vault = await ethers.getContractFactory('Vault');
  const vault = await Vault.attach(vaultAddress);

  const poolFeesAddress = await vault.getPoolFeesCollector();
  console.log('poolFeesAddress:', poolFeesAddress);

  const PoolFee = await ethers.getContractFactory('PoolFees');
  const poolFees = PoolFee.attach(poolFeesAddress);
  const _vault = await poolFees.vault();
  console.log('vault:', _vault);

  const BPT = await ethers.getContractFactory('ERC20');
  const bpt = BPT.attach('0x39a038b3345Ca092688dC058e738E723D93ab280');
  const balance = await bpt.balanceOf(deployer);

  await bpt.transfer(poolFeesAddress, ethers.utils.parseEther('0.1'));

  await poolFees.claimAll(poolId, deployer);

  console.log('Successfully claimBPTFees the pool');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
