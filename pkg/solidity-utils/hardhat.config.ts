import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import 'hardhat-ignore-warnings';
import '@nomicfoundation/hardhat-verify';

import { hardhatBaseConfig } from '@balancer-labs/v2-common';
import { name } from './package.json';

export default {
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,
    },
    // for testnet
    baseSepolia: {
      url: 'https://sepolia.base.org',
      accounts: ['c44bcf3e9e1b4d3078250e75243d597459f34ccf2d77e60d10ce768291393421'],
      // gasPrice: 1000000000,
    },
    // base: {
    //   url: 'https://mainnet.base.org',
    //   accounts: [process.env.PRIVATE_KEY as string],
    //   // gasPrice: 1000000000,
    // },
    // polygon: {
    //   url: 'https://polygon-bor-rpc.publicnode.com',
    //   accounts: [process.env.PRIVATE_KEY as string],
    //   // gasPrice: 1000000000,
    // },
  },
  etherscan: {
    apiKey: 'CHZ6N22Q1Z3SDT62HYKMB7UMDR3M1HRCHG',
  },
  sourcify: {
    enabled: true,
  },
  solidity: {
    compilers: hardhatBaseConfig.compilers,
    overrides: { ...hardhatBaseConfig.overrides(name) },
  },
  warnings: hardhatBaseConfig.warnings,
};
