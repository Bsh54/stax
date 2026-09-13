/**
 * Initialize every Stax vault on the running Surfpool mainnet fork, and seed each with a small
 * deposit so the frontend shows real, non-zero state. Funds the authority with each xStock via the
 * `surfnet_setTokenAccount` cheatcode (fork only, no real assets), creates the vault if missing,
 * then deposits a seed amount.
 *
 * Prereqs: surfpool on 127.0.0.1:8899 with the Stax program deployed, funded payer at
 * ~/.config/solana/id.json.
 *
 * Run from client/: `npx tsx test/initAllVaults.ts`
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:8899';
const VAULT_SEED = Buffer.from('vault');
const SHARE_SEED = Buffer.from('share');
const SEED_DEPOSIT = 50_000_000n; // raw units to seed per vault (0.5 stock at 8 decimals)

// The 10 xStocks with a Kamino reserve (see _reference/kamino-xstocks-addresses.md).
const MINTS: Record<string, string> = {
  NVDAx: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
  SPYx: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W',
  QQQx: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ',
  TSLAx: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
  AAPLx: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
  GOOGLx: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN',
  MSTRx: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ',
  METAx: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu',
  HOODx: 'XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg',
  CRCLx: 'XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1',
};

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
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

async function main() {
  const idl = JSON.parse(readFileSync('../target/idl/stax.json', 'utf8'));
  const programId = new PublicKey(idl.address);
  const payer = loadKeypair(`${homedir()}/.config/solana/id.json`);
  const connection = new Connection(RPC, 'confirmed');
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: 'confirmed',
  });
  const program = new anchor.Program(idl, provider);

  for (const [symbol, mintStr] of Object.entries(MINTS)) {
    const mint = new PublicKey(mintStr);
    const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, mint.toBuffer()], programId);
    const [shareMint] = PublicKey.findProgramAddressSync([SHARE_SEED, mint.toBuffer()], programId);
    const stockVault = getAssociatedTokenAddressSync(mint, vault, true, TOKEN_2022_PROGRAM_ID);
    const userStock = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const userShare = getAssociatedTokenAddressSync(shareMint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

    try {
      const existing = await connection.getAccountInfo(vault);
      if (!existing) {
        await program.methods
          .initializeVault()
          .accounts({
            authority: payer.publicKey,
            stockMint: mint,
            vault,
            shareMint,
            stockVault,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log(`${symbol}: vault created`);
      } else {
        console.log(`${symbol}: vault exists`);
      }

      // Seed a deposit so the card shows real state.
      const va: any = await (program.account as any).vault.fetch(vault);
      if (BigInt(va.totalAssets.toString()) === 0n) {
        await rpc('surfnet_setTokenAccount', [
          payer.publicKey.toBase58(),
          mint.toBase58(),
          { amount: Number(SEED_DEPOSIT) },
          TOKEN_2022_PROGRAM_ID.toBase58(),
        ]);
        await program.methods
          .deposit(new BN(SEED_DEPOSIT.toString()), new BN(0))
          .accounts({
            user: payer.publicKey,
            vault,
            stockMint: mint,
            shareMint,
            userStock,
            stockVault,
            userShare,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log(`${symbol}: seeded ${SEED_DEPOSIT} raw`);
      } else {
        console.log(`${symbol}: already funded (${va.totalAssets.toString()})`);
      }
    } catch (e) {
      console.error(`${symbol}: FAILED -`, (e as Error).message);
    }
  }

  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
