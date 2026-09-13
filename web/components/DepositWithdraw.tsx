'use client';

import { useState } from 'react';
import { Transaction } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  STOCKS,
  buildDepositIx,
  buildWithdrawIx,
  confirmSignature,
  fetchTokenBalance,
  shareMintPda,
  fmt,
  parseAmount,
  assetsToShares,
  sharesToAssets,
  type VaultState,
} from '@/lib/stax';
import { useDemoWallet } from '@/components/useDemoWallet';

/**
 * Deposit / withdraw panel, wired to a browser-local demo account (see useDemoWallet). It funds via
 * the faucet, signs fork transactions locally, submits through the /api/rpc proxy, and confirms over
 * HTTP. This is what makes the demo clickable by anyone: no external wallet, no mainnet mismatch.
 */

type Tab = 'deposit' | 'withdraw';
type Stage = 'idle' | 'sending' | 'done' | 'error';

const short = (s: string) => `${s.slice(0, 4)}..${s.slice(-4)}`;

export function DepositWithdraw({ symbol, vault }: { symbol: string; vault: VaultState | null }) {
  const stock = STOCKS[symbol];
  const { connection } = useConnection();
  const demo = useDemoWallet();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('deposit');
  const [raw, setRaw] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [msg, setMsg] = useState('');
  const [sig, setSig] = useState('');
  const [faucetBusy, setFaucetBusy] = useState(false);

  const owner = demo?.publicKey ?? null;

  const { data: walletStock = BigInt(0) } = useQuery({
    queryKey: ['demo-stock', symbol, owner?.toBase58()],
    queryFn: () => (owner ? fetchTokenBalance(connection, owner, stock.mint) : BigInt(0)),
    enabled: !!owner,
    refetchInterval: 5000,
  });
  const { data: walletShares = BigInt(0) } = useQuery({
    queryKey: ['demo-shares', symbol, owner?.toBase58()],
    queryFn: () => (owner ? fetchTokenBalance(connection, owner, shareMintPda(stock.mint)) : BigInt(0)),
    enabled: !!owner,
    refetchInterval: 5000,
  });

  const amount = parseAmount(raw, stock.decimals);
  const total = vault?.totalAssets ?? BigInt(0);
  const supply = vault?.shareSupply ?? BigInt(0);
  const previewShares = tab === 'deposit' ? assetsToShares(amount, total, supply) : BigInt(0);
  const previewAssets = tab === 'withdraw' ? sharesToAssets(amount, total, supply) : BigInt(0);
  const max = tab === 'deposit' ? walletStock : walletShares;
  const overMax = amount > max;
  const empty = amount <= BigInt(0);

  async function getTestTokens() {
    if (!owner) return;
    try {
      setFaucetBusy(true);
      const r = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: owner.toBase58(), symbol }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Faucet failed');
      setTimeout(() => qc.invalidateQueries(), 900);
    } catch (e) {
      setMsg((e as Error).message);
      setStage('error');
    } finally {
      setFaucetBusy(false);
    }
  }

  async function submit() {
    if (!demo || empty) return;
    try {
      setStage('sending');
      setMsg('Building transaction');
      const ix =
        tab === 'deposit'
          ? await buildDepositIx(demo.publicKey, stock.mint, amount, BigInt(0))
          : await buildWithdrawIx(demo.publicKey, stock.mint, amount, BigInt(0));
      const tx = new Transaction().add(ix);
      tx.feePayer = demo.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(demo);
      setMsg('Confirming on Solana');
      const signature = await connection.sendRawTransaction(tx.serialize());
      setSig(signature);
      await confirmSignature(connection, signature);
      setStage('done');
      setMsg(tab === 'deposit' ? 'Deposit confirmed' : 'Withdrawal confirmed');
      setRaw('');
      qc.invalidateQueries();
    } catch (e) {
      setStage('error');
      setMsg((e as Error).message || 'Transaction failed');
    }
  }

  return (
    <div className="card">
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 0 }}>
          {(['deposit', 'withdraw'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setRaw('');
                setStage('idle');
              }}
              className="btn"
              style={{
                background: tab === t ? 'var(--ink)' : 'transparent',
                color: tab === t ? 'var(--surface)' : 'var(--ink)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        {owner ? <span className="caption">Demo account {short(owner.toBase58())}</span> : null}
      </div>

      <div className="stack-sm" style={{ marginBottom: 14 }}>
        <div className="row-between">
          <span className="stat-label">Amount</span>
          <span className="caption tnum">
            {tab === 'deposit'
              ? `${fmt(walletStock, stock.decimals)} ${symbol}`
              : `${fmt(walletShares, stock.decimals)} shares`}
          </span>
        </div>
        <input
          className="input"
          inputMode="decimal"
          placeholder="0.00"
          value={raw}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || /^\d*\.?\d*$/.test(v)) setRaw(v);
          }}
        />
        <div className="row" style={{ gap: 8 }}>
          {[25, 50, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              className="btn"
              style={{ padding: '6px 12px', minHeight: 32, fontSize: 12, flex: 1 }}
              onClick={() => setRaw(fmt((max * BigInt(pct)) / BigInt(100), stock.decimals, 8))}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {!empty ? (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="row-between">
            <span className="stat-label">{tab === 'deposit' ? 'Shares received' : 'Stock received'}</span>
            <span className="tnum">
              {tab === 'deposit'
                ? fmt(previewShares, stock.decimals)
                : `${fmt(previewAssets, stock.decimals)} ${symbol}`}
            </span>
          </div>
        </div>
      ) : null}

      {overMax ? (
        <p className="caption" style={{ color: 'var(--risk-restricted)', margin: '0 0 12px' }}>
          More than you have. Max {fmt(max, stock.decimals)}.
        </p>
      ) : null}

      {tab === 'deposit' && walletStock <= BigInt(0) ? (
        <button
          className="btn btn-ghost btn-block"
          style={{ marginBottom: 12 }}
          disabled={faucetBusy || !owner}
          onClick={getTestTokens}
        >
          {faucetBusy ? 'Sending test tokens...' : `Get test ${symbol} (demo)`}
        </button>
      ) : null}

      <button
        className="btn btn-primary btn-block"
        disabled={empty || overMax || stage === 'sending' || !owner}
        onClick={submit}
      >
        {empty
          ? 'Enter an amount'
          : stage === 'sending'
            ? msg
            : tab === 'deposit'
              ? `Deposit ${symbol}`
              : `Withdraw ${symbol}`}
      </button>

      {stage === 'done' || stage === 'error' ? (
        <p
          className="caption"
          style={{ margin: '12px 0 0', color: stage === 'done' ? 'var(--risk-healthy)' : 'var(--risk-restricted)' }}
        >
          {msg}
          {sig && stage === 'done' ? (
            <>
              {' '}
              <a href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer" style={{ borderBottom: '2px solid var(--lime)' }}>
                View
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <p className="caption" style={{ margin: '14px 0 0', color: 'var(--muted)' }}>
        Demo runs on a Solana mainnet fork with real Kamino and xStocks. No real funds, no wallet
        setup: a throwaway account signs for you.
      </p>
    </div>
  );
}
