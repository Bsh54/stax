/**
 * End-to-end check (step 3): initialize the vault's Kamino position (user metadata
 * + obligation, owned by the vault PDA) on a running Surfpool mainnet fork.
 *
 * Prereqs: surfpool on 127.0.0.1:8899, Stax deployed, funded payer, vault created
 * (run initVault.ts first).
 *
 * Run from client/: `npx tsx test/kaminoInit.ts`
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import BN from 'bn.js';
import { address } from '@solana/kit';
import {
  PROGRAM_ID as KLEND,
  VanillaObligation,
  userMetadataPda,
} from '@kamino-finance/klend-sdk';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:8899';
const NVDAX_MINT = new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');
const XSTOCKS_MARKET = new PublicKey('5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua');
const KLEND_ID = new PublicKey(KLEND.toString());
const VAULT_SEED = Buffer.from('vault');

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}
const toPk = (a: { toString(): string }) => new PublicKey(a.toString());

async function main() {
  const idl = JSON.parse(readFileSync('../target/idl/stax.json', 'utf8'));
  const programId = new PublicKey(idl.address);
  const payer = loadKeypair(`${homedir()}/.config/solana/id.json`);
  const connection = new Connection(RPC, 'confirmed');
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: 'confirmed',
  });
  const program = new anchor.Program(idl, provider);

  const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, NVDAX_MINT.toBuffer()], programId);

  const vaultAddr = address(vault.toBase58());
  const marketAddr = address(XSTOCKS_MARKET.toBase58());
  const obligation = toPk(await new VanillaObligation(KLEND).toPda(marketAddr, vaultAddr));
  const [userMetadataAddr] = await userMetadataPda(vaultAddr, KLEND);
  const userMetadata = toPk(userMetadataAddr);

  console.log('vault       :', vault.toBase58());
  console.log('obligation  :', obligation.toBase58());
  console.log('userMetadata:', userMetadata.toBase58());

  const sig = await program.methods
    .initKaminoPosition(0, 0, PublicKey.default)
    .accounts({
      authority: payer.publicKey,
      vault,
      stockMint: NVDAX_MINT,
      userMetadata,
      referrerUserMetadata: KLEND_ID,
      obligation,
      lendingMarket: XSTOCKS_MARKET,
      seed1Account: SystemProgram.programId,
      seed2Account: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log('init_kamino_position sig:', sig);

  const obl = await connection.getAccountInfo(obligation);
  const meta = await connection.getAccountInfo(userMetadata);
  console.log('obligation created  :', !!obl, obl ? `(owner ${obl.owner.toBase58()}, ${obl.data.length} bytes)` : '');
  console.log('userMetadata created:', !!meta, meta ? `(owner ${meta.owner.toBase58()})` : '');
  if (!obl || !meta) throw new Error('Kamino position not created');
  console.log('OK: vault-owned Kamino obligation initialized on the fork');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
