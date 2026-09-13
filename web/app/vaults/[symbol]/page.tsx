'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useConnection } from '@solana/wallet-adapter-react';
import { useQuery } from '@tanstack/react-query';
import { Nav, Footer, Stat, RiskBadge, type VaultStatus } from '@/components/primitives';
import { DepositWithdraw } from '@/components/DepositWithdraw';
import { STOCKS, fetchVault, sharePrice, fmt } from '@/lib/stax';

function liquidityStatus(ratio: number): VaultStatus {
  if (ratio > 0.15) return 'healthy';
  if (ratio >= 0.05) return 'caution';
  return 'low';
}

const RISK_COLOR: Record<VaultStatus, string> = {
  healthy: 'var(--risk-healthy)',
  caution: 'var(--risk-attention)',
  low: 'var(--risk-restricted)',
};

export default function VaultDetail() {
  const params = useParams();
  const symbol = String(params.symbol);
  const stock = STOCKS[symbol];
  const { connection } = useConnection();

  const { data: vault, isLoading } = useQuery({
    queryKey: ['vault', symbol],
    queryFn: () => (stock ? fetchVault(connection, stock.mint) : null),
    enabled: !!stock,
    refetchInterval: 8000,
  });

  if (!stock) {
    return (
      <>
        <Nav />
        <main className="shell section">
          <h1 className="heading-lg">Unknown vault</h1>
          <p className="muted">No vault for &quot;{symbol}&quot;.</p>
          <Link className="btn btn-ghost" href="/vaults">Back to vaults</Link>
        </main>
        <Footer />
      </>
    );
  }

  const liquidPct = vault ? Math.round(vault.liquidRatio * 100) : 100;
  const status = liquidityStatus(vault?.liquidRatio ?? 1);

  return (
    <>
      <Nav />

      <main className="shell section">
        <Link href="/vaults" className="caption" style={{ borderBottom: '2px solid var(--lime)' }}>
          &lt;- All vaults
        </Link>

        <div className="row-between" style={{ alignItems: 'flex-end', margin: '18px 0 28px', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="heading-lg" style={{ margin: 0 }}>{symbol}</h1>
            <p className="muted" style={{ margin: '6px 0 0' }}>{stock.name} yield vault</p>
          </div>
          <RiskBadge status={status} />
        </div>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* -------------------------------------------------- left: state */}
          <div className="card">
            {isLoading ? (
              <p className="muted">Loading vault state...</p>
            ) : !vault ? (
              <p className="muted">Vault not initialized yet.</p>
            ) : (
              <>
                <div className="figure-grid-cells" style={{ marginBottom: 20 }}>
                  <Stat label="Total value locked" value={`${fmt(vault.totalAssets, stock.decimals)}`} />
                  <Stat label="Share price" value={sharePrice(vault.totalAssets, vault.shareSupply).toFixed(6)} />
                  <Stat label="Deployed" value={`${fmt(vault.deployedAssets, stock.decimals)}`} />
                  <Stat label="Yield harvested" value={`${fmt(vault.totalYield, stock.decimals)}`} />
                </div>

                <div className="row-between" style={{ marginBottom: 8 }}>
                  <span className="micro">Liquidity available</span>
                  <span className="caption tnum" style={{ color: RISK_COLOR[status] }}>{liquidPct}%</span>
                </div>
                <div style={{ height: 10, background: 'var(--bone)', border: '2px solid var(--ink)' }}>
                  <div style={{ height: '100%', width: `${liquidPct}%`, background: RISK_COLOR[status] }} />
                </div>
              </>
            )}
          </div>

          {/* -------------------------------------------------- right: actions */}
          <DepositWithdraw symbol={symbol} vault={vault ?? null} />
        </div>
      </main>

      <Footer />
    </>
  );
}
