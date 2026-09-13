import Link from 'next/link';
import { HeaderIsland } from '@/components/header-island';

/**
 * Shared presentational primitives, ported from the Duna design system.
 *
 * Every risk signal carries a text label as well as a colour. Red and green alone are not an
 * accessible way to tell someone their position is in trouble.
 */

export type VaultStatus = 'healthy' | 'caution' | 'low';

const STATUS_LABEL: Record<VaultStatus, string> = {
  healthy: 'Healthy',
  caution: 'Caution',
  low: 'Low liquidity',
};

// Reuse the design system risk classes (risk-NORMAL / risk-NO_NEW_RISK / risk-REDUCE_ONLY).
const STATUS_CLASS: Record<VaultStatus, string> = {
  healthy: 'risk-NORMAL',
  caution: 'risk-NO_NEW_RISK',
  low: 'risk-REDUCE_ONLY',
};

export function RiskBadge({ status }: { status: VaultStatus }) {
  return <span className={`risk ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * Typographic mark for a vault, in the Open House letter-logotype spirit: the ticker root (symbol
 * without the trailing "x") set in a square lime block. Characterises each vault without external
 * assets or brand trademarks, and stays on-theme.
 */
export function TickerMark({ symbol, size = 48 }: { symbol: string; size?: number }) {
  const root = symbol.replace(/x$/, '');
  const fontSize = root.length >= 4 ? size * 0.3 : size * 0.4;
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        background: 'var(--lime)',
        border: '3px solid var(--ink)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 800,
        fontSize,
        letterSpacing: '-0.04em',
        color: 'var(--ink)',
        flex: 'none',
      }}
    >
      {root}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  prefix = '',
}: {
  label: string;
  value: string;
  hint?: string;
  prefix?: string;
}) {
  return (
    <div className="stack-sm">
      <div className="stat-label">{label}</div>
      <div className="stat-value tnum">
        {prefix}
        {value}
      </div>
      {hint ? <div className="caption">{hint}</div> : null}
    </div>
  );
}

/** Text wordmark, standing in for the brand lockup. */
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Stax home">
      <span style={{ fontWeight: 500, fontSize: 20, letterSpacing: '-0.03em' }}>Stax</span>
    </Link>
  );
}

/** The site header, which condenses into a floating island on scroll. */
export function Nav({ cta = true, walletButton }: { cta?: boolean; walletButton?: React.ReactNode }) {
  return (
    <>
      <HeaderIsland headerId="site-header" />
      <header id="site-header" className="site-header" data-condensed="false">
        <div className="site-header-inner">
          <Logo />
          <nav className="site-header-nav" aria-label="Site">
            <Link href="/#vaults">Vaults</Link>
            <Link href="/#how">How it works</Link>
            <Link href="/#safety">Safety</Link>
            <a href="https://github.com/Bsh54/stax" target="_blank" rel="noreferrer">
              Code
            </a>
          </nav>
          {walletButton ? walletButton : cta ? (
            <Link href="/vaults" className="btn btn-primary site-header-cta">
              Open Stax
            </Link>
          ) : (
            <span />
          )}
        </div>
      </header>
    </>
  );
}

/** The site footer. */
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-grid">
          <div className="footer-brand">
            <span style={{ fontWeight: 500, fontSize: 22, letterSpacing: '-0.03em' }}>Stax</span>
            <p className="caption" style={{ margin: '16px 0 0', maxWidth: '30ch' }}>
              Make your tokenized stocks productive without selling them.
            </p>
          </div>

          <div className="footer-col">
            <h4>Product</h4>
            <ul>
              <li><Link href="/#vaults">Vaults</Link></li>
              <li><Link href="/#how">How it works</Link></li>
              <li><Link href="/#safety">Safety engine</Link></li>
              <li><a href="https://github.com/Bsh54/stax" target="_blank" rel="noreferrer">Code</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Verify</h4>
            <ul>
              <li><a href="https://github.com/Bsh54/stax" target="_blank" rel="noreferrer">Open source</a></li>
              <li><Link href="/#safety">Safety model</Link></li>
              <li><Link href="/#vaults">Live vault state</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Composability</h4>
            <ul>
              <li><a href="https://kamino.finance" target="_blank" rel="noreferrer">Kamino</a></li>
              <li><a href="https://xstocks.fi" target="_blank" rel="noreferrer">xStocks</a></li>
              <li><a href="https://solana.com" target="_blank" rel="noreferrer">Solana</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-base">
          <span className="caption">Stax. Yield-bearing tokenized stocks on Solana.</span>
          <span className="caption" style={{ color: 'var(--stone)' }}>
            Non-custodial: your funds stay controlled by the contract.
          </span>
        </div>
      </div>
    </footer>
  );
}
