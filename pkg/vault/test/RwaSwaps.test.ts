import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Dictionary } from 'lodash';
import { BigNumber, Contract, ContractReceipt } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import TokenList, { ETH_TOKEN_ADDRESS } from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import { actionId } from '@balancer-labs/v2-helpers/src/models/misc/actions';
import { encodeJoin } from '@balancer-labs/v2-helpers/src/models/pools/mockPool';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { Comparison, expectBalanceChange } from '@balancer-labs/v2-helpers/src/test/tokenBalance';
import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';

import {
  BatchSwapStep,
  FundManagement,
  SingleSwap,
  SwapKind,
  PoolSpecialization,
  RelayerAuthorization,
} from '@balancer-labs/balancer-js';
import { deploy, deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import { BigNumberish, bn, fp, FP_ONE } from '@balancer-labs/v2-helpers/src/numbers';
import {
  ANY_ADDRESS,
  MAX_GAS_LIMIT,
  MAX_INT256,
  MAX_UINT112,
  MAX_UINT256,
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from '@balancer-labs/v2-helpers/src/constants';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';

type SwapData = {
  pool?: number; // Index in the poolIds array
  amount: number | BigNumber;
  in: number; // Index in the tokens array
  out: number; // Index in the tokens array
  data?: string;
  fromOther?: boolean;
  toOther?: boolean;
};

type SwapInput = {
  swaps: SwapData[];
  fromOther?: boolean;
  toOther?: boolean;
  signature?: boolean | string;
};

type TestTokenObject = {
  symbol: string;
  index: number;
};

describe('RwaSwaps', () => {
  let vault: Contract, authorizer: Contract, funds: FundManagement;
  let tokens: TokenList;
  let mainPoolId: string, secondaryPoolId: string;
  let lp: SignerWithAddress, trader: SignerWithAddress, other: SignerWithAddress, admin: SignerWithAddress;

  const poolInitialBalance = bn(50e18);
  before('setup', async () => {
    [, lp, trader, other, admin] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy vault and tokens', async () => {
    tokens = await TokenList.create(['DAI', 'RWATT', 'RWATT2']);

    ({ instance: vault, authorizer } = await Vault.create({ admin }));

    // Contortions required to get the Vault's version of WETH to be in tokens
    const wethContract = await deployedAt('v2-standalone-utils/TestWETH', await vault.WETH());
    // And also need a real Token, in order to call mint
    const wethToken = new Token('Wrapped Ether', 'WETH', 18, wethContract);
    tokens.tokens.push(wethToken);
    tokens = new TokenList(tokens.tokens);

    await tokens.mint({ to: [lp, trader], amount: bn(200e18) });
    await tokens.approve({ to: vault, from: [lp, trader], amount: MAX_UINT112 });
  });

  beforeEach('set up default sender', async () => {
    funds = {
      sender: trader.address,
      recipient: trader.address,
      fromInternalBalance: false,
      toInternalBalance: false,
    };
  });
  context('swaps function should throw error if one of tokens is RWA token', () => {
    context('with two tokens. one of them is RWA token. the other is ERC20 token', () => {
      const testTokenList = [
        { symbol: 'DAI', index: 0 },
        { symbol: 'RWATT', index: 1 },
      ];

      context('with a general pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.GeneralPool, testTokenList);
      });

      context('with a minimal swap info pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.MinimalSwapInfoPool, testTokenList);
      });

      context('with a two token pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.TwoTokenPool, testTokenList);
      });
    });
    context('with two tokens. All of them are RWA tokens', () => {
      const testTokenList = [
        { symbol: 'RWATT', index: 1 },
        { symbol: 'RWATT2', index: 2 },
      ];

      context('with a general pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.GeneralPool, testTokenList);
      });

      context('with a minimal swap info pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.MinimalSwapInfoPool, testTokenList);
      });

      context('with a two token pool', () => {
        itHandlesSwapsProperly(PoolSpecialization.TwoTokenPool, testTokenList);
      });
    });
  });

  function toBatchSwap(input: SwapInput): BatchSwapStep[] {
    return input.swaps.map((data) => ({
      poolId: ((data.pool ?? 0) == 0 ? mainPoolId : secondaryPoolId) || ZERO_BYTES32,
      amount: data.amount.toString(),
      assetInIndex: data.in,
      assetOutIndex: data.out,
      userData: data.data ?? '0x',
    }));
  }

  function toSingleSwap(kind: SwapKind, input: SwapInput): SingleSwap {
    const data = toBatchSwap(input)[0];
    return {
      kind,
      poolId: data.poolId,
      amount: data.amount,
      assetIn: tokens.addresses[data.assetInIndex] || ZERO_ADDRESS,
      assetOut: tokens.addresses[data.assetOutIndex] || ZERO_ADDRESS,
      userData: data.userData,
    };
  }

  async function deployPool(specialization: PoolSpecialization, tokenSymbols: string[]): Promise<string> {
    const pool = await deploy('MockPool', { args: [vault.address, specialization] });
    await pool.setMultiplier(fp(2));

    // Register tokens
    const sortedTokenAddresses = tokenSymbols
      .map((symbol) => tokens.findBySymbol(symbol))
      .sort((tokenA, tokenB) => tokenA.compare(tokenB))
      .map((token) => token.address);

    const assetManagers = sortedTokenAddresses.map(() => ZERO_ADDRESS);

    await pool.connect(lp).registerTokens(sortedTokenAddresses, assetManagers);

    // Join the pool - the actual amount is not relevant since the MockPool relies on the multiplier to calculate prices
    const tokenAmounts = sortedTokenAddresses.map(() => poolInitialBalance);

    const poolId = pool.getPoolId();
    await vault.connect(lp).joinPool(poolId, lp.address, other.address, {
      assets: sortedTokenAddresses,
      maxAmountsIn: tokenAmounts,
      fromInternalBalance: false,
      userData: encodeJoin(tokenAmounts, Array(sortedTokenAddresses.length).fill(0)),
    });

    return poolId;
  }

  function deployMainPool(specialization: PoolSpecialization, tokenSymbols: string[]) {
    sharedBeforeEach('deploy main pool', async () => {
      mainPoolId = await deployPool(specialization, tokenSymbols);
    });
  }

  function deployAnotherPool(specialization: PoolSpecialization, tokenSymbols: string[]) {
    sharedBeforeEach('deploy secondary pool', async () => {
      secondaryPoolId = await deployPool(specialization, tokenSymbols);
    });
  }

  function itHandlesSwapsProperly(specialization: PoolSpecialization, testTokenList: TestTokenObject[]) {
    deployMainPool(
      specialization,
      testTokenList.map((v) => v.symbol)
    );
    const assertSwapGivenInReverts = (input: SwapInput, defaultReason?: string, singleSwapReason = defaultReason) => {
      const isSingleSwap = input.swaps.length === 1;

      if (isSingleSwap) {
        it(`reverts ${isSingleSwap ? '(single)' : ''}`, async () => {
          const sender = input.fromOther ? other : trader;
          const swap = toSingleSwap(SwapKind.GivenIn, input);
          const call = vault.connect(sender).swap(swap, funds, 0, MAX_UINT256);

          singleSwapReason
            ? await expect(call).to.be.revertedWith(singleSwapReason)
            : await expect(call).to.be.reverted;
        });
      }

      // it(`reverts ${isSingleSwap ? '(batch)' : ''}`, async () => {
      //   const sender = input.fromOther ? other : trader;
      //   const swaps = toBatchSwap(input);

      //   const limits = Array(tokens.length).fill(MAX_INT256);
      //   const deadline = MAX_UINT256;

      //   const call = vault
      //     .connect(sender)
      //     .batchSwap(SwapKind.GivenIn, swaps, tokens.addresses, funds, limits, deadline);
      //   defaultReason ? await expect(call).to.be.revertedWith(defaultReason) : await expect(call).to.be.reverted;
      // });
    };

    context('for a single swap', () => {
      context('normal token order', () => {
        const swaps = [{ in: testTokenList[0].index, out: testTokenList[1].index, amount: 1e18 }];
        assertSwapGivenInReverts({ swaps }, 'INVALID_TOKEN');
      });
      context('reverse token order', () => {
        const swaps = [{ in: testTokenList[1].index, out: testTokenList[0].index, amount: 1e18 }];
        assertSwapGivenInReverts({ swaps }, 'INVALID_TOKEN');
      });
    });
  }
});
