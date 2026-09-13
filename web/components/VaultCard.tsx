'use client';

import Link from 'next/link';
import { useConnection } from '@solana/wallet-adapter-react';
import { useQuery } from '@tanstack/react-query';
import { STOCKS, fetchVaultBrief, fmt } from '@/lib/stax';
import { RiskBadge, type VaultStatus } from '@/components/primitives';

/** Liquidity status derived from the liquid fraction (withdrawal availability). */
function liquidityStatus(ratio: number): VaultStatus {
  if (ratio > 0.15) return 'healthy';
  if (ratio >= 0.05) return 'caution';
  return 'low';
}

/**
 * Vault list card, deliberately light: one headline number (TVL) and the safety badge, the two
 * high-value signals. Everything else (share price, deployed, yield, your position, deposit) lives
 * on the vault detail page reached via "Open vault". One account read per card.
 */
export function VaultCard({ symbol }: { symbol: string }) {
  const { connection } = useConnection();
  const stock = STOCKS[symbol];
  const { data } = useQuery({
    queryKey: ['vault-brief', symbol],
    queryFn: () => fetchVaultBrief(connection, stock.mint),
  });

  const status = liquidityStatus(data?.liquidRatio ?? 1);

  return (
    <div className="card">
      <div className="row-between" style={{ alignItems: 'flex-start', marginBottom: 20 }}>
        <div className="stack-sm" style={{ gap: 2 }}>
          <span className="subheading" style={{ letterSpacing: '-0.03em' }}>{symbol}</span>
          <span className="caption">{stock.name}</span>
        </div>
        {data ? <RiskBadge status={status} /> : null}
      </div>

      <div className="stack-sm" style={{ gap: 2, marginBottom: 20 }}>
        <span className="stat-label">Total value locked</span>
        <span className="stat-value tnum">
          {data ? `${fmt(data.totalAssets, stock.decimals)} ${symbol}` : '--'}
        </span>
      </div>

      <Link className="btn btn-primary btn-block" href={`/vaults/${symbol}`}>
        Open vault
      </Link>
    </div>
  );
}
