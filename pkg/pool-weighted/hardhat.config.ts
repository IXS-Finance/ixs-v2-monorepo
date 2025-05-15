import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import 'hardhat-ignore-warnings';
import 'hardhat-deploy';
// import '@nomicfoundation/hardhat-verify';
import '@nomiclabs/hardhat-etherscan';

import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env

import { hardhatBaseConfig } from '@balancer-labs/v2-common';
import { name } from './package.json';

import { task } from 'hardhat/config';
import { TASK_COMPILE } from 'hardhat/builtin-tasks/task-names';
import overrideQueryFunctions from '@balancer-labs/v2-helpers/plugins/overrideQueryFunctions';

task(TASK_COMPILE).setAction(overrideQueryFunctions);

export default {
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
    },
  },
  external: {
    contracts: [
      {
        artifacts: '../standalone-utils',
      },
      {
        artifacts: '../solidity-utils',
      },
      {
        artifacts: '../vault',
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,
    },
    sepolia: {
      url: 'https://1rpc.io/sepolia',
      accounts: [process.env.DEPLOYER_PRIVATE_KEY as string],
      gasPrice: 1000000000,
      verify: {
        etherscan: {
          apiUrl: 'https://api-sepolia.basescan.org/api',
          apiKey: 'CHZ6N22Q1Z3SDT62HYKMB7UMDR3M1HRCHG',
        },
      },
    },
    // for testnet
    baseSepolia: {
      url: 'https://sepolia.base.org',
      accounts: [process.env.DEPLOYER_PRIVATE_KEY as string],
      gasPrice: 1000000000,
      verify: {
        etherscan: {
          apiUrl: 'https://api-sepolia.basescan.org/api',
          apiKey: 'CHZ6N22Q1Z3SDT62HYKMB7UMDR3M1HRCHG',
        },
      },
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
    apiKey: {
      baseSepolia: 'CHZ6N22Q1Z3SDT62HYKMB7UMDR3M1HRCHG',
    },
    customChains: [
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
  solidity: {
    compilers: hardhatBaseConfig.compilers,
  },
  warnings: hardhatBaseConfig.warnings,
};
