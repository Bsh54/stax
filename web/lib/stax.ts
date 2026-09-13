import {
  Connection,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

/** Stax program id (matches declare_id! in the on-chain program). */
export const STAX_PROGRAM_ID = new PublicKey('DWqrx3j2gJYGEc4VfB1RjRtu4K8fx32Font6DWhckm6i');

/**
 * Supported tokenized stocks (xStocks). Mints are the Kamino xStocks market liquidity mints
 * (see _reference/kamino-xstocks-addresses.md); every one of these has a Kamino reserve, so the
 * yield leg works for all of them. xStocks are Token-2022 with 8 decimals.
 */
export const STOCKS: Record<string, { symbol: string; name: string; mint: PublicKey; decimals: number }> = {
  NVDAx: { symbol: 'NVDAx', name: 'NVIDIA', mint: new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh'), decimals: 8 },
  SPYx: { symbol: 'SPYx', name: 'S&P 500', mint: new PublicKey('XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W'), decimals: 8 },
  QQQx: { symbol: 'QQQx', name: 'Nasdaq 100', mint: new PublicKey('Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ'), decimals: 8 },
  TSLAx: { symbol: 'TSLAx', name: 'Tesla', mint: new PublicKey('XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB'), decimals: 8 },
  AAPLx: { symbol: 'AAPLx', name: 'Apple', mint: new PublicKey('XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp'), decimals: 8 },
  GOOGLx: { symbol: 'GOOGLx', name: 'Alphabet', mint: new PublicKey('XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN'), decimals: 8 },
  MSTRx: { symbol: 'MSTRx', name: 'MicroStrategy', mint: new PublicKey('XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ'), decimals: 8 },
  METAx: { symbol: 'METAx', name: 'Meta', mint: new PublicKey('Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu'), decimals: 8 },
  HOODx: { symbol: 'HOODx', name: 'Robinhood', mint: new PublicKey('XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg'), decimals: 8 },
  CRCLx: { symbol: 'CRCLx', name: 'Circle', mint: new PublicKey('XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1'), decimals: 8 },
};

export const STOCK_SYMBOLS = Object.keys(STOCKS);

const VAULT_SEED = Buffer.from('vault');
const SHARE_SEED = Buffer.from('share');
const VIRTUAL_SHARES = BigInt(1000);
const VIRTUAL_ASSETS = BigInt(1);
const ZERO = BigInt(0);

export function vaultPda(stockMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([VAULT_SEED, stockMint.toBuffer()], STAX_PROGRAM_ID)[0];
}
export function shareMintPda(stockMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SHARE_SEED, stockMint.toBuffer()], STAX_PROGRAM_ID)[0];
}

export interface VaultState {
  exists: boolean;
  authority: PublicKey;
  stockMint: PublicKey;
  shareMint: PublicKey;
  stockVault: PublicKey;
  totalAssets: bigint;
  deployedAssets: bigint;
  totalYield: bigint;
  shareSupply: bigint;
  /** Raw stock currently liquid in the vault (total - deployed). */
  liquid: bigint;
  /** Fraction of assets kept liquid (0..1); withdrawal-availability signal. */
  liquidRatio: number;
}

const u64 = (d: Buffer, o: number) => d.readBigUInt64LE(o);

/** Fetch and decode a vault account plus its share-mint supply. */
export async function fetchVault(conn: Connection, stockMint: PublicKey): Promise<VaultState | null> {
  const vault = vaultPda(stockMint);
  const info = await conn.getAccountInfo(vault);
  if (!info) return null;
  const d = info.data;
  const authority = new PublicKey(d.subarray(8, 40));
  const sMint = new PublicKey(d.subarray(40, 72));
  const shareMint = new PublicKey(d.subarray(72, 104));
  const stockVault = new PublicKey(d.subarray(104, 136));
  const totalAssets = u64(d, 136);
  const deployedAssets = u64(d, 144);
  const totalYield = u64(d, 152);

  let shareSupply = ZERO;
  const mintInfo = await conn.getAccountInfo(shareMint);
  if (mintInfo) shareSupply = u64(mintInfo.data, 36);

  const liquid = totalAssets > deployedAssets ? totalAssets - deployedAssets : ZERO;
  const liquidRatio = totalAssets > ZERO ? Number(liquid) / Number(totalAssets) : 1;

  return {
    exists: true,
    authority,
    stockMint: sMint,
    shareMint,
    stockVault,
    totalAssets,
    deployedAssets,
    totalYield,
    shareSupply,
    liquid,
    liquidRatio,
  };
}

/**
 * Lightweight vault read for the list cards: one account fetch, no share-mint call. Returns just the
 * headline TVL and the liquidity ratio (for the safety badge).
 */
export async function fetchVaultBrief(
  conn: Connection,
  stockMint: PublicKey,
): Promise<{ totalAssets: bigint; deployedAssets: bigint; liquidRatio: number } | null> {
  const info = await conn.getAccountInfo(vaultPda(stockMint));
  if (!info) return null;
  const d = info.data;
  const totalAssets = u64(d, 136);
  const deployedAssets = u64(d, 144);
  const liquid = totalAssets > deployedAssets ? totalAssets - deployedAssets : ZERO;
  const liquidRatio = totalAssets > ZERO ? Number(liquid) / Number(totalAssets) : 1;
  return { totalAssets, deployedAssets, liquidRatio };
}

/** Read a wallet's token balance for a mint (raw units), 0 if the account does not exist. */
export async function fetchTokenBalance(
  conn: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const info = await conn.getAccountInfo(ata);
  if (!info) return ZERO;
  return u64(info.data, 64); // SPL token account: amount is a u64 LE at offset 64
}

/** Redeemable assets per share, using the same virtual offset as the program. */
export function sharePrice(totalAssets: bigint, shareSupply: bigint): number {
  const num = Number(totalAssets + VIRTUAL_ASSETS);
  const den = Number(shareSupply + VIRTUAL_SHARES);
  return den === 0 ? 0 : num / den;
}

/** Assets to shares, mirroring the program math (for the deposit preview). */
export function assetsToShares(assets: bigint, totalAssets: bigint, shareSupply: bigint): bigint {
  const num = assets * (shareSupply + VIRTUAL_SHARES);
  const den = totalAssets + VIRTUAL_ASSETS;
  return den === ZERO ? ZERO : num / den;
}

/** Shares to assets, mirroring the program math (for the withdraw preview). */
export function sharesToAssets(shares: bigint, totalAssets: bigint, shareSupply: bigint): bigint {
  const num = shares * (totalAssets + VIRTUAL_ASSETS);
  const den = shareSupply + VIRTUAL_SHARES;
  return den === ZERO ? ZERO : num / den;
}

/** Format a raw token amount to a human display value. */
export function fmt(raw: bigint, decimals: number, maxFrac = 4): string {
  const neg = raw < ZERO;
  const s = (neg ? -raw : raw).toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals) || '0';
  const frac = s.slice(s.length - decimals).replace(/0+$/, '').slice(0, maxFrac);
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

/** Parse a human decimal string into raw base units for a given decimal count. */
export function parseAmount(input: string, decimals: number): bigint {
  const clean = input.trim();
  if (!clean || !/^\d*\.?\d*$/.test(clean)) return ZERO;
  const [whole = '0', frac = ''] = clean.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt((whole || '0') + fracPadded);
}

// ---------------------------------------------------------------- instruction builders

/** Anchor instruction discriminator: first 8 bytes of sha256("global:<name>"). */
async function discriminator(name: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  return new Uint8Array(hash).slice(0, 8);
}

function u64le(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}

function key(pubkey: PublicKey, isSigner: boolean, isWritable: boolean) {
  return { pubkey, isSigner, isWritable };
}

/**
 * Confirm a transaction by polling getSignatureStatuses over HTTP.
 *
 * The default web3.js confirmTransaction uses a websocket subscription, which does not survive our
 * same-origin HTTP RPC proxy. Polling the signature status works over plain HTTP. Returns when the
 * signature reaches at least "confirmed", or throws on error / timeout.
 */
export async function confirmSignature(conn: Connection, signature: string, timeoutMs = 40_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await conn.getSignatureStatuses([signature], { searchTransactionHistory: false });
    const st = value[0];
    if (st) {
      if (st.err) throw new Error(`Transaction failed: ${JSON.stringify(st.err)}`);
      if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error('Confirmation timed out');
}

/**
 * Build the `deposit(amount, min_shares_out)` instruction.
 * Account order mirrors the Deposit accounts struct in the program.
 */
export async function buildDepositIx(
  user: PublicKey,
  stockMint: PublicKey,
  amount: bigint,
  minSharesOut: bigint,
): Promise<TransactionInstruction> {
  const vault = vaultPda(stockMint);
  const shareMint = shareMintPda(stockMint);
  const stockVault = getAssociatedTokenAddressSync(stockMint, vault, true, TOKEN_2022_PROGRAM_ID);
  const userStock = getAssociatedTokenAddressSync(stockMint, user, false, TOKEN_2022_PROGRAM_ID);
  const userShare = getAssociatedTokenAddressSync(shareMint, user, false, TOKEN_2022_PROGRAM_ID);

  const disc = await discriminator('deposit');
  const data = Buffer.concat([disc, u64le(amount), u64le(minSharesOut)]);

  return new TransactionInstruction({
    programId: STAX_PROGRAM_ID,
    keys: [
      key(user, true, true),
      key(vault, false, true),
      key(stockMint, false, false),
      key(shareMint, false, true),
      key(userStock, false, true),
      key(stockVault, false, true),
      key(userShare, false, true),
      key(TOKEN_2022_PROGRAM_ID, false, false),
      key(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
      key(SystemProgram.programId, false, false),
    ],
    data,
  });
}

/**
 * Build the `withdraw(shares, min_assets_out)` instruction.
 * Account order mirrors the Withdraw accounts struct in the program.
 */
export async function buildWithdrawIx(
  user: PublicKey,
  stockMint: PublicKey,
  shares: bigint,
  minAssetsOut: bigint,
): Promise<TransactionInstruction> {
  const vault = vaultPda(stockMint);
  const shareMint = shareMintPda(stockMint);
  const stockVault = getAssociatedTokenAddressSync(stockMint, vault, true, TOKEN_2022_PROGRAM_ID);
  const userStock = getAssociatedTokenAddressSync(stockMint, user, false, TOKEN_2022_PROGRAM_ID);
  const userShare = getAssociatedTokenAddressSync(shareMint, user, false, TOKEN_2022_PROGRAM_ID);

  const disc = await discriminator('withdraw');
  const data = Buffer.concat([disc, u64le(shares), u64le(minAssetsOut)]);

  return new TransactionInstruction({
    programId: STAX_PROGRAM_ID,
    keys: [
      key(user, true, true),
      key(vault, false, true),
      key(stockMint, false, false),
      key(shareMint, false, true),
      key(userStock, false, true),
      key(stockVault, false, true),
      key(userShare, false, true),
      key(TOKEN_2022_PROGRAM_ID, false, false),
      key(SystemProgram.programId, false, false),
    ],
    data,
  });
}
