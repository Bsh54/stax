import Link from 'next/link';
import { STOCK_SYMBOLS } from '@/lib/stax';
import { VaultCard } from '@/components/VaultCard';

/**
 * Landing preview of the vaults: the first three only, with a link to the full list.
 * The wallet lives on the /vaults page, not here — the landing stays marketing.
 */
export function VaultsSection() {
  const preview = STOCK_SYMBOLS.slice(0, 3);
  return (
    <section className="section" id="vaults">
      <div className="shell">
        <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div style={{ maxWidth: 560 }}>
            <div className="micro">Vaults</div>
            <h2 className="heading" style={{ margin: '14px 0 0' }}>
              Pick a stock, keep the upside, earn the yield.
            </h2>
          </div>
          <Link className="btn btn-ghost" href="/vaults">See all vaults</Link>
        </div>
        <div className="grid-3">
          {preview.map((s) => (
            <VaultCard key={s} symbol={s} />
          ))}
        </div>
      </div>
    </section>
  );
}
