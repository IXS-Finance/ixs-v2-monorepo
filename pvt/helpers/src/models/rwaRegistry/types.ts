import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

export type RwaRegistryDeployment = {
  from?: SignerWithAddress;
};

export type RwaAuthorizationData = {
  operator: string;
  v: number;
  r: string;
  s: string;
};

export type RwaSwap = {
  assetIn: string;
  assetOut: string;
};

export type RwaBatchSwap = {
  assets: string[];
};
