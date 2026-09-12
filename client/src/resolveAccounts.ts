/**
 * Print the resolved Kamino accounts for a given stock symbol. Sanity check for
 * the account resolver; run with `npm run resolve -- NVDAx`.
 */
import { createSolanaRpc } from '@solana/kit';
import { resolveMarket } from './kaminoAccounts.js';

const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const symbol = process.argv[2] || 'NVDAx';

const rpc = createSolanaRpc(RPC);
const m = await resolveMarket(rpc, symbol);

console.log(JSON.stringify(m, null, 2));
