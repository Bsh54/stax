/**
 * End-to-end check (step 2): deposit NVDAx into the Stax vault and withdraw it
 * back, on a running Surfpool mainnet fork. Funds the depositor with NVDAx via
 * the `surfnet_setTokenAccount` cheatcode (no real assets), then exercises the
 * full share lifecycle against the real Token-2022 (Scaled UI Amount) mint.
 *
 * Prereqs: surfpool on 127.0.0.1:8899, Stax deployed, a funded payer, and the
 * vault already created (run initVault.ts first).
 *
 * Run from client/: `npx tsx test/depositWithdraw.ts`
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:8899';
const NVDAX_MINT = new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');
const VAULT_SEED = Buffer.from('vault');
const SHARE_SEED = Buffer.from('share');
const DEPOSIT_RAW = 100_000_000n; // raw base units to deposit

function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(readFileSync(path, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function tokenBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  const info = await conn.getAccountInfo(ata);
  if (!info) return 0n;
  // SPL token account: amount is a u64 LE at offset 64.
  return info.data.readBigUInt64LE(64);
}

async function main() {
  const idl = JSON.parse(readFileSync('../target/idl/stax.json', 'utf8'));
  const programId = new PublicKey(idl.address);
  const payer = loadKeypair(`${homedir()}/.config/solana/id.json`);
  const connection = new Connection(RPC, 'confirmed');
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: 'confirmed',
  });
  const program = new anchor.Program(idl, provider);

  const [vault] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, NVDAX_MINT.toBuffer()],
    programId,
  );
  const [shareMint] = PublicKey.findProgramAddressSync(
    [SHARE_SEED, NVDAX_MINT.toBuffer()],
    programId,
  );
  const stockVault = getAssociatedTokenAddressSync(NVDAX_MINT, vault, true, TOKEN_2022_PROGRAM_ID);
  const userStock = getAssociatedTokenAddressSync(NVDAX_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const userShare = getAssociatedTokenAddressSync(shareMint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

  // Fund the depositor with NVDAx using the surfpool cheatcode (no real assets).
  await rpc('surfnet_setTokenAccount', [
    payer.publicKey.toBase58(),
    NVDAX_MINT.toBase58(),
    { amount: Number(DEPOSIT_RAW) },
    TOKEN_2022_PROGRAM_ID.toBase58(),
  ]);
  console.log('funded depositor NVDAx:', (await tokenBalance(connection, userStock)).toString());

  const depositSig = await program.methods
    .deposit(new BN(DEPOSIT_RAW.toString()), new BN(0))
    .accounts({
      user: payer.publicKey,
      vault,
      stockMint: NVDAX_MINT,
      shareMint,
      userStock,
      stockVault,
      userShare,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log('deposit sig:', depositSig);

  const shares = await tokenBalance(connection, userShare);
  const vaultStock = await tokenBalance(connection, stockVault);
  console.log('shares minted   :', shares.toString());
  console.log('vault stock bal :', vaultStock.toString());
  if (shares <= 0n) throw new Error('no shares minted');
  if (vaultStock !== DEPOSIT_RAW) throw new Error('vault stock balance mismatch');

  const withdrawSig = await program.methods
    .withdraw(new BN(shares.toString()), new BN(0))
    .accounts({
      user: payer.publicKey,
      vault,
      stockMint: NVDAX_MINT,
      shareMint,
      userStock,
      stockVault,
      userShare,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log('withdraw sig:', withdrawSig);

  const stockBack = await tokenBalance(connection, userStock);
  const vaultAfter = await tokenBalance(connection, stockVault);
  console.log('user stock after withdraw:', stockBack.toString());
  console.log('vault stock after withdraw:', vaultAfter.toString());
  if (stockBack !== DEPOSIT_RAW) throw new Error('round-trip did not return full stock');
  console.log('OK: deposit -> shares -> withdraw round-trip works on the fork');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
