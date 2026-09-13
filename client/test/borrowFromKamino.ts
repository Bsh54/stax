/**
 * End-to-end check (step 5): borrow USDC against the vault's Kamino collateral on
 * a running Surfpool mainnet fork, via the vault-signed CPI.
 *
 * Prereqs: surfpool on 127.0.0.1:8899, Stax deployed, funded payer, vault created,
 * Kamino position initialized, and NVDAx deployed as collateral
 * (run initVault -> kaminoInit -> deployToKamino first).
 *
 * Run from client/: `npx tsx test/borrowFromKamino.ts`
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import BN from 'bn.js';
import { address, createSolanaRpc } from '@solana/kit';
import { PROGRAM_ID as KLEND, VanillaObligation, obligationFarmStatePda } from '@kamino-finance/klend-sdk';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { resolveMarket } from '../src/kaminoAccounts.js';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:8899';
const NVDAX_MINT = new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');
const XSTOCKS_MARKET = new PublicKey('5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua');
const KLEND_ID = new PublicKey(KLEND.toString());
const FARMS_PROGRAM = new PublicKey('FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr');
const VAULT_SEED = Buffer.from('vault');
const BORROW_USDC = 5_000_000n; // 5 USDC (6 decimals)

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));
}
const toPk = (a: { toString(): string }) => new PublicKey(a.toString());
const meta = (pubkey: PublicKey, isWritable: boolean, isSigner = false) => ({ pubkey, isWritable, isSigner });

function refreshReserveIx(reserve: PublicKey, scope: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: KLEND_ID,
    data: Buffer.from([2, 218, 138, 235, 79, 201, 25, 102]),
    keys: [
      meta(reserve, true),
      meta(XSTOCKS_MARKET, false),
      meta(KLEND_ID, false),
      meta(KLEND_ID, false),
      meta(KLEND_ID, false),
      meta(scope, false),
    ],
  });
}
function refreshObligationIx(obligation: PublicKey, reserves: PublicKey[]): TransactionInstruction {
  return new TransactionInstruction({
    programId: KLEND_ID,
    data: Buffer.from([33, 132, 147, 228, 151, 192, 72, 89]),
    keys: [
      meta(XSTOCKS_MARKET, false),
      meta(obligation, true),
      ...reserves.map((r) => meta(r, true)),
    ],
  });
}

function initObligationFarmIx(args: {
  payer: PublicKey; owner: PublicKey; obligation: PublicKey; lma: PublicKey;
  reserve: PublicKey; reserveFarm: PublicKey; obligationFarm: PublicKey; mode: number;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: KLEND_ID,
    data: Buffer.concat([Buffer.from([136, 63, 15, 186, 211, 152, 168, 164]), Buffer.from([args.mode])]),
    keys: [
      meta(args.payer, true, true),
      meta(args.owner, false),
      meta(args.obligation, true),
      meta(args.lma, false),
      meta(args.reserve, true),
      meta(args.reserveFarm, true),
      meta(args.obligationFarm, true),
      meta(XSTOCKS_MARKET, false),
      meta(FARMS_PROGRAM, false),
      meta(SYSVAR_RENT_PUBKEY, false),
      meta(SystemProgram.programId, false),
    ],
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
  const obligation = toPk(await new VanillaObligation(KLEND).toPda(address(XSTOCKS_MARKET.toBase58()), address(vault.toBase58())));

  const m = await resolveMarket(rpc, 'NVDAx');
  const stockReserve = toPk(m.stock.reserve);
  const stockScope = toPk(m.stock.scopePrices);
  const usdc = m.usdc;
  const usdcReserve = toPk(usdc.reserve);
  const usdcMint = toPk(usdc.liquidityMint);
  const usdcScope = toPk(usdc.scopePrices);
  const usdcFarm = toPk(usdc.reserveFarmState);
  const usdcVault = getAssociatedTokenAddressSync(usdcMint, vault, true, toPk(usdc.tokenProgram));
  const obligationFarmUserState = toPk(await obligationFarmStatePda(address(usdcFarm.toBase58()), address(obligation.toBase58()), address(FARMS_PROGRAM.toBase58())));

  // Ensure the vault has a USDC token account to receive the borrow.
  await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'surfnet_setTokenAccount', params: [vault.toBase58(), usdcMint.toBase58(), { amount: 0 }, usdc.tokenProgram.toString()] }),
  });

  // Initialize the obligation's USDC debt farm in its own transaction first.
  const farmInfo = await connection.getAccountInfo(obligationFarmUserState);
  if (!farmInfo) {
    const initTx = new Transaction().add(
      initObligationFarmIx({
        payer: payer.publicKey, owner: vault, obligation, lma: toPk(m.lendingMarketAuthority),
        reserve: usdcReserve, reserveFarm: usdcFarm, obligationFarm: obligationFarmUserState, mode: 1,
      }),
    );
    const initSig = await provider.sendAndConfirm(initTx, []);
    console.log('init obligation farm sig:', initSig);
  }

  const sig = await program.methods
    .borrowFromKamino(new BN(BORROW_USDC.toString()))
    .accounts({
      authority: payer.publicKey,
      vault,
      stockMint: NVDAX_MINT,
      usdcVault,
      obligation,
      lendingMarket: XSTOCKS_MARKET,
      lendingMarketAuthority: toPk(m.lendingMarketAuthority),
      borrowReserve: usdcReserve,
      borrowReserveLiquidityMint: usdcMint,
      reserveSourceLiquidity: toPk(usdc.reserveLiquiditySupply),
      borrowReserveLiquidityFeeReceiver: toPk(usdc.feeReceiver),
      referrerTokenState: KLEND_ID,
      tokenProgram: toPk(usdc.tokenProgram),
      instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
      obligationFarmUserState,
      reserveFarmState: usdcFarm,
      farmsProgram: FARMS_PROGRAM,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      refreshReserveIx(stockReserve, stockScope),
      refreshReserveIx(usdcReserve, usdcScope),
      refreshObligationIx(obligation, [stockReserve]),
    ])
    .rpc();
  console.log('borrow_from_kamino sig:', sig);

  const info = await connection.getAccountInfo(usdcVault);
  const bal = info ? info.data.readBigUInt64LE(64) : 0n;
  console.log('vault USDC balance after borrow:', bal.toString());
  if (bal < BORROW_USDC) throw new Error('borrowed USDC not received');
  console.log('OK: borrowed USDC against NVDAx collateral on the fork');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
