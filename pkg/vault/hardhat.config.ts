import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import 'hardhat-ignore-warnings';
import '@nomicfoundation/hardhat-verify';
import 'hardhat-contract-sizer';

import { hardhatBaseConfig } from '@balancer-labs/v2-common';
import { name } from './package.json';

import { task } from 'hardhat/config';
import { TASK_COMPILE } from 'hardhat/builtin-tasks/task-names';
import overrideQueryFunctions from '@balancer-labs/v2-helpers/plugins/overrideQueryFunctions';

task(TASK_COMPILE).setAction(overrideQueryFunctions);

export default {
  solidity: {
    compilers: hardhatBaseConfig.compilers,
    overrides: { ...hardhatBaseConfig.overrides(name) },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    baseSepolia: {
      url: 'https://sepolia.base.org',
      accounts: ['c44bcf3e9e1b4d3078250e75243d597459f34ccf2d77e60d10ce768291393421'],
      // gasPrice: 1000000000,
    },
  },
  etherscan: {
    apiKey: 'CHZ6N22Q1Z3SDT62HYKMB7UMDR3M1HRCHG',
  },
  sourcify: {
    enabled: true,
  },
  warnings: hardhatBaseConfig.warnings,
};
