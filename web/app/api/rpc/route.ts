/**
 * Same-origin JSON-RPC proxy.
 *
 * The browser cannot reach the Solana RPC directly (it runs on the VPS at 127.0.0.1:8899, and the
 * validator is not exposed publicly). This route runs server-side on the same host, so it forwards
 * JSON-RPC calls to the local validator. The frontend points its Connection at /api/rpc, which keeps
 * reads (and our own transaction submission) working without exposing the RPC or touching shared
 * infrastructure.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPSTREAM = process.env.STAX_RPC_UPSTREAM || 'http://127.0.0.1:8899';

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: (e as Error).message } }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

export async function GET() {
  return new Response(JSON.stringify({ ok: true, upstream: UPSTREAM }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
