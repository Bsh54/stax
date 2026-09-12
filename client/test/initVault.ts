/**
 * End-to-end check (step 1): create a Stax vault for NVDAx on a running Surfpool
 * mainnet fork, using the deployed program. Proves our program executes on-chain
 * against real Token-2022 stock mints fetched from mainnet.
 *
 * Prereqs: surfpool running on 127.0.0.1:8899 with the Stax program deployed, and
 * a funded payer at ~/.config/solana/id.json.
 *
 * Run from client/: `npx tsx test/initVault.ts`
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
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:8899';
const NVDAX_MINT = new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');
const VAULT_SEED = Buffer.from('vault');
const SHARE_SEED = Buffer.from('share');

function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(readFileSync(path, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const idl = JSON.parse(readFileSync('../target/idl/stax.json', 'utf8'));
  const programId = new PublicKey(idl.address);

  const payer = loadKeypair(`${homedir()}/.config/solana/id.json`);
  const connection = new Connection(RPC, 'confirmed');
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
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
  const stockVault = getAssociatedTokenAddressSync(
    NVDAX_MINT,
    vault,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  console.log('program:', programId.toBase58());
  console.log('payer  :', payer.publicKey.toBase58());
  console.log('vault  :', vault.toBase58());
  console.log('share  :', shareMint.toBase58());
  console.log('stockVault:', stockVault.toBase58());

  const existing = await connection.getAccountInfo(vault);
  if (existing) {
    console.log('vault already exists, skipping init');
  } else {
    const sig = await program.methods
      .initializeVault()
      .accounts({
        authority: payer.publicKey,
        stockMint: NVDAX_MINT,
        vault,
        shareMint,
        stockVault,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('initialize_vault sig:', sig);
  }

  const vaultAccount = await (program.account as any).vault.fetch(vault);
  console.log('--- vault state ---');
  console.log('authority :', vaultAccount.authority.toBase58());
  console.log('stockMint :', vaultAccount.stockMint.toBase58());
  console.log('shareMint :', vaultAccount.shareMint.toBase58());
  console.log('stockVault:', vaultAccount.stockVault.toBase58());
  console.log('totalAssets:', vaultAccount.totalAssets.toString());
  console.log('bump:', vaultAccount.bump);
  console.log('OK: vault created and readable on the fork');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
