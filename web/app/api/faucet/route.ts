/**
 * Demo faucet (fork only).
 *
 * Credits a wallet with a test amount of a tokenized stock, plus a little SOL for fees, using the
 * surfpool cheatcode `surfnet_setTokenAccount` and a standard airdrop. The mint's real authority is
 * irrelevant on the fork: surfpool writes the token account directly. This is what makes the demo
 * clickable by anyone without real funds. Runs server-side against the local validator, so no RPC is
 * exposed publicly.
 */
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { STOCKS } from '@/lib/stax';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPSTREAM = process.env.STAX_RPC_UPSTREAM || 'http://127.0.0.1:8899';
const FAUCET_AMOUNT = 200_000_000; // 2 stock at 8 decimals

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(UPSTREAM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

export async function POST(req: Request) {
  try {
    const { owner, symbol } = (await req.json()) as { owner?: string; symbol?: string };
    if (!owner || !symbol || !STOCKS[symbol]) {
      return Response.json({ error: 'owner and a valid symbol are required' }, { status: 400 });
    }
    const ownerPk = new PublicKey(owner);
    const mint = STOCKS[symbol].mint;

    // Give the wallet the test stock (creates the ATA and sets the balance).
    const setTok = await rpc('surfnet_setTokenAccount', [
      ownerPk.toBase58(),
      mint.toBase58(),
      { amount: FAUCET_AMOUNT },
      TOKEN_2022_PROGRAM_ID.toBase58(),
    ]);
    if (setTok.error) throw new Error(`setTokenAccount: ${JSON.stringify(setTok.error)}`);

    // A little SOL for transaction fees (best effort).
    await rpc('requestAirdrop', [ownerPk.toBase58(), 200_000_000]);

    const ata = getAssociatedTokenAddressSync(mint, ownerPk, false, TOKEN_2022_PROGRAM_ID);
    return Response.json({ ok: true, symbol, amount: FAUCET_AMOUNT, ata: ata.toBase58() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
