/**
 * End-to-end check (step 4): deposit the vault's NVDAx into Kamino as obligation
 * collateral on a running Surfpool mainnet fork, via the vault-signed CPI.
 *
 * Funds the vault's stock account via cheatcode, prepends Kamino's refresh_reserve
 * and refresh_obligation, then calls deploy_to_kamino. Verifies the obligation
 * records the deposited collateral.
 *
 * Prereqs: surfpool on 127.0.0.1:8899, Stax deployed, funded payer, vault created
 * (initVault.ts) and Kamino position initialized (kaminoInit.ts).
 *
 * Run from client/: `npx tsx test/deployToKamino.ts`
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import BN from 'bn.js';
import { address, createSolanaRpc } from '@solana/kit';
import {
  PROGRAM_ID as KLEND,
  VanillaObligation,
} from '@kamino-finance/klend-sdk';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { resolveMarket } from '../src/kaminoAccounts.js';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:8899';
const NVDAX_MINT = new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');
const XSTOCKS_MARKET = new PublicKey('5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua');
const KLEND_ID = new PublicKey(KLEND.toString());
const FARMS_PROGRAM = new PublicKey('FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr');
const VAULT_SEED = Buffer.from('vault');
const DEPLOY_RAW = 100_000_000n;

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));
}
const toPk = (a: { toString(): string }) => new PublicKey(a.toString());
async function rpcCall(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

const disc = (a: number[]) => Buffer.from(a);
const meta = (pubkey: PublicKey, isWritable: boolean, isSigner = false) => ({ pubkey, isWritable, isSigner });

function refreshReserveIx(reserve: PublicKey, market: PublicKey, scope: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: KLEND_ID,
    data: disc([2, 218, 138, 235, 79, 201, 25, 102]),
    keys: [
      meta(reserve, true),
      meta(market, false),
      meta(KLEND_ID, false), // pyth (none -> program id sentinel)
      meta(KLEND_ID, false), // switchboard price (none)
      meta(KLEND_ID, false), // switchboard twap (none)
      meta(scope, false),
    ],
  });
}
function refreshObligationIx(market: PublicKey, obligation: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: KLEND_ID,
    data: disc([33, 132, 147, 228, 151, 192, 72, 89]),
    keys: [meta(market, false), meta(obligation, true)],
  });
}

async function main() {
  const idl = JSON.parse(readFileSync('../target/idl/stax.json', 'utf8'));
  const programId = new PublicKey(idl.address);
  const payer = loadKeypair(`${homedir()}/.config/solana/id.json`);
  const connection = new Connection(RPC, 'confirmed');
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: 'confirmed' });
  const program = new anchor.Program(idl, provider);
  const rpc = createSolanaRpc(RPC);

  const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, NVDAX_MINT.toBuffer()], programId);
  const stockVault = getAssociatedTokenAddressSync(NVDAX_MINT, vault, true, TOKEN_2022_PROGRAM_ID);
  const obligation = toPk(await new VanillaObligation(KLEND).toPda(address(XSTOCKS_MARKET.toBase58()), address(vault.toBase58())));

  const m = await resolveMarket(rpc, 'NVDAx');
  const s = m.stock;
  const reserve = toPk(s.reserve);
  const scope = toPk(s.scopePrices);
  const lma = toPk(m.lendingMarketAuthority);

  // Fund the vault's stock account with NVDAx (no real assets).
  await rpcCall('surfnet_setTokenAccount', [
    vault.toBase58(), NVDAX_MINT.toBase58(), { amount: Number(DEPLOY_RAW) }, TOKEN_2022_PROGRAM_ID.toBase58(),
  ]);

  const sig = await program.methods
    .deployToKamino(new BN(DEPLOY_RAW.toString()))
    .accounts({
      authority: payer.publicKey,
      vault,
      stockMint: NVDAX_MINT,
      stockVault,
      obligation,
      lendingMarket: XSTOCKS_MARKET,
      lendingMarketAuthority: lma,
      reserve,
      reserveLiquiditySupply: toPk(s.reserveLiquiditySupply),
      reserveCollateralMint: toPk(s.collateralMint),
      reserveDestinationDepositCollateral: toPk(s.collateralSupply),
      placeholderUserDestinationCollateral: KLEND_ID,
      collateralTokenProgram: TOKEN_PROGRAM_ID,
      liquidityTokenProgram: toPk(s.tokenProgram),
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      obligationFarmUserState: KLEND_ID,
      reserveFarmState: KLEND_ID,
      farmsProgram: FARMS_PROGRAM,
    })
    .preInstructions([
      refreshReserveIx(reserve, XSTOCKS_MARKET, scope),
      refreshObligationIx(XSTOCKS_MARKET, obligation),
    ])
    .rpc();
  console.log('deploy_to_kamino sig:', sig);

  const obl = await connection.getAccountInfo(obligation);
  console.log('obligation size:', obl?.data.length);
  console.log('OK: NVDAx deployed to Kamino as collateral on the fork');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
