import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import 'hardhat-ignore-warnings';
import 'hardhat-deploy';
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
    // for testnet
    baseSepolia: {
      url: 'https://sepolia.base.org',
      accounts: [process.env.DEPLOYER_PRIVATE_KEY as string],
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
  solidity: {
    compilers: hardhatBaseConfig.compilers,
    overrides: { ...hardhatBaseConfig.overrides(name) },
  },
  warnings: hardhatBaseConfig.warnings,
};
