/**
 * Resolves every Kamino (klend) account that the Stax program's CPI
 * instructions need, using the klend SDK so nothing is hardcoded.
 *
 * The Stax program builds the klend instructions by hand (see kamino.rs), so the
 * client must pass the exact klend accounts in order. This module derives them
 * from the reserve state and klend PDAs for a given xStocks market and symbol.
 */
import { address, type Address, type Rpc, type SolanaRpcApi } from '@solana/kit';
import {
  KaminoMarket,
  PROGRAM_ID as KLEND_PROGRAM_ID,
  lendingMarketAuthPda,
  reserveLiqSupplyPda,
  reserveFeeVaultPda,
  reserveCollateralMintPda,
  reserveCollateralSupplyPda,
  userMetadataPda,
  obligationFarmStatePda,
  getObligationPdaWithArgs,
} from '@kamino-finance/klend-sdk';

/** Kamino Farms program (owner of farm state accounts). */
export const FARMS_PROGRAM_ID = address('FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr');
/** xStocks lending market on mainnet. */
export const XSTOCKS_MARKET = address('5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua');
export const SYSTEM_PROGRAM = address('11111111111111111111111111111111');
export const SYSVAR_INSTRUCTIONS = address('Sysvar1nstructions1111111111111111111111111');
export const SYSVAR_RENT = address('SysvarRent111111111111111111111111111111111');
/** Default placeholder used by klend when an optional account is unset. */
export const NONE = KLEND_PROGRAM_ID;

export { KLEND_PROGRAM_ID };

/** Everything needed to reference and refresh a single reserve. */
export interface ResolvedReserve {
  symbol: string;
  reserve: Address;
  liquidityMint: Address;
  tokenProgram: Address;
  reserveLiquiditySupply: Address;
  feeReceiver: Address;
  collateralMint: Address;
  collateralSupply: Address;
  scopePrices: Address;
  /** Farm state for the reserve, or NONE when the reserve has no farm. */
  reserveFarmState: Address;
  hasFarm: boolean;
}

async function resolveReserve(
  market: KaminoMarket,
  symbol: string,
): Promise<ResolvedReserve> {
  const arr = market.getReservesBySymbol(symbol);
  if (!arr || arr.length === 0) throw new Error(`reserve ${symbol} not found`);
  const res: any = arr[0];
  const state = res.state;
  const mint: Address = state.liquidity.mintPubkey;
  const [reserveLiquiditySupply] = await reserveLiqSupplyPda(XSTOCKS_MARKET, mint, KLEND_PROGRAM_ID);
  const [feeReceiver] = await reserveFeeVaultPda(XSTOCKS_MARKET, mint, KLEND_PROGRAM_ID);
  const [collateralMint] = await reserveCollateralMintPda(XSTOCKS_MARKET, mint, KLEND_PROGRAM_ID);
  const [collateralSupply] = await reserveCollateralSupplyPda(XSTOCKS_MARKET, mint, KLEND_PROGRAM_ID);

  const farmDebt: Address = state.farmDebt;
  const farmColl: Address = state.farmCollateral;
  const hasFarm = farmColl !== SYSTEM_PROGRAM || farmDebt !== SYSTEM_PROGRAM;

  return {
    symbol,
    reserve: res.address,
    liquidityMint: mint,
    tokenProgram: state.liquidity.tokenProgram,
    reserveLiquiditySupply,
    feeReceiver,
    collateralMint,
    collateralSupply,
    scopePrices: state.config.tokenInfo.scopeConfiguration.priceFeed,
    reserveFarmState: farmDebt !== SYSTEM_PROGRAM ? farmDebt : farmColl,
    hasFarm,
  };
}

export interface ResolvedMarket {
  market: Address;
  lendingMarketAuthority: Address;
  stock: ResolvedReserve;
  usdc: ResolvedReserve;
}

/** Load the xStocks market and resolve the stock and USDC reserves. */
export async function resolveMarket(
  rpc: Rpc<SolanaRpcApi>,
  stockSymbol: string,
): Promise<ResolvedMarket> {
  const market = await KaminoMarket.load(rpc, XSTOCKS_MARKET, 450, KLEND_PROGRAM_ID);
  await market.loadReserves();
  const [lendingMarketAuthority] = await lendingMarketAuthPda(XSTOCKS_MARKET, KLEND_PROGRAM_ID);
  return {
    market: XSTOCKS_MARKET,
    lendingMarketAuthority,
    stock: await resolveReserve(market, stockSymbol),
    usdc: await resolveReserve(market, 'USDC'),
  };
}

export interface VaultPosition {
  obligation: Address;
  userMetadata: Address;
}

/**
 * Derive the vault's klend position PDAs. The obligation is owned by the vault
 * PDA; `tag`/`id` select the obligation type (0/0 for a vanilla obligation).
 */
export async function deriveVaultPosition(
  vaultPda: Address,
  tag = 0,
  id = 0,
): Promise<VaultPosition> {
  const obligation = await getObligationPdaWithArgs(
    XSTOCKS_MARKET,
    vaultPda,
    { tag, id } as any,
    KLEND_PROGRAM_ID,
  );
  const [userMetadata] = await userMetadataPda(vaultPda, KLEND_PROGRAM_ID);
  return { obligation, userMetadata };
}

/** Farm user-state PDA for an obligation against a farm (or NONE when no farm). */
export async function farmUserState(
  reserveFarmState: Address,
  obligation: Address,
): Promise<Address> {
  if (reserveFarmState === NONE || reserveFarmState === SYSTEM_PROGRAM) return NONE;
  return obligationFarmStatePda(reserveFarmState, obligation, FARMS_PROGRAM_ID);
}
