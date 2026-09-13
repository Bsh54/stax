'use client';

import dynamic from 'next/dynamic';
import { Nav, Footer } from '@/components/primitives';
import { VaultCard } from '@/components/VaultCard';
import { STOCK_SYMBOLS } from '@/lib/stax';

// Wallet button is client-only (avoids SSR hydration issues). Shows the address once connected.
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false },
);

/**
 * `/vaults` — the full vault list.
 *
 * The wallet lives here, in the header corner: connect once and your address stays visible while you
 * move between vaults. Every stock the Kamino xStocks market lists is shown.
 */
export default function VaultsList() {
  return (
    <>
      <Nav walletButton={<WalletMultiButton />} />

      <main className="shell section">
        <div style={{ marginBottom: 28 }}>
          <div className="micro">All vaults</div>
          <h1 className="heading-lg" style={{ margin: '12px 0 0', maxWidth: '20ch' }}>
            Every tokenized stock, put to work.
          </h1>
        </div>

        <div className="grid-3">
          {STOCK_SYMBOLS.map((s) => (
            <VaultCard key={s} symbol={s} />
          ))}
        </div>
      </main>

      <Footer />
    </>
  );
}
