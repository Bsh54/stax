import Link from 'next/link';
import { Nav, Footer } from '@/components/primitives';
import { VaultsSection } from '@/components/VaultsSection';

/**
 * Landing page.
 *
 * One promise, one flow, the live vaults. No filler: the outcome, how it works, the safety engine,
 * then the product itself.
 */

export default function Landing() {
  return (
    <>
      <Nav />

      <main>
        {/* -------------------------------------------------------------- hero */}
        <section className="hero">
          <div className="shell hero-inner">
            <h1 className="hero-headline">Put your tokenized stocks to work.</h1>
            <p className="hero-sub">
              Deposit a tokenized stock, keep your full price exposure, earn yield, with a safety
              engine built to keep you from getting liquidated.
            </p>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link className="btn btn-primary btn-lg" href="/vaults">Open Stax</Link>
              <Link className="btn btn-ghost btn-lg" href="/#how">How it works</Link>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- how it works */}
        <section className="section" id="how">
          <div className="shell">
            <h2 className="heading-lg" style={{ margin: '0 0 28px', maxWidth: '20ch' }}>
              Deposit. Earn. Withdraw.
            </h2>
            <div className="editorial-cols" style={{ marginTop: 0 }}>
              <div className="editorial-col">
                <div className="micro">Deposit</div>
                <ul>
                  <li>Deposit a tokenized stock</li>
                  <li>Mint vault shares</li>
                  <li>Keep your price exposure</li>
                </ul>
              </div>
              <div className="editorial-col">
                <div className="micro">Earn</div>
                <ul>
                  <li>Collateral deployed on Kamino</li>
                  <li>Conservative borrow</li>
                  <li>Net yield accrues to shares</li>
                </ul>
              </div>
              <div className="editorial-col">
                <div className="micro">Stay safe</div>
                <ul>
                  <li>Low target loan-to-value</li>
                  <li>Auto-deleverage before risk</li>
                  <li>Withdraw when liquid</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- vaults (live) */}
        <VaultsSection />

        {/* -------------------------------------------------------------- safety engine */}
        <section className="section" id="safety">
          <div className="shell">
            <div className="micro">Safety engine</div>
            <h2 className="heading-lg" style={{ margin: '14px 0 16px', maxWidth: '20ch' }}>
              Earn the yield. Keep the position.
            </h2>
            <p className="muted" style={{ margin: '0 0 4px', maxWidth: '58ch' }}>
              Stocks gap overnight and over weekends. Stax runs at a low target loan-to-value and
              repays before a liquidation would trigger.
            </p>
            <div className="proof-flow">
              <span className="proof-flow-step">Collateral deposited</span>
              <span className="proof-flow-arrow">-&gt;</span>
              <span className="proof-flow-step">Conservative borrow</span>
              <span className="proof-flow-arrow">-&gt;</span>
              <span className="proof-flow-step">Health monitored</span>
              <span className="proof-flow-arrow">-&gt;</span>
              <span className="proof-flow-step">Auto-deleverage before liquidation</span>
            </div>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------------- close */}
      <section className="closer">
        <div className="closer-inner">
          <h2 className="closer-headline">Make your tokenized stocks productive.</h2>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className="btn btn-primary btn-lg closer-cta" href="/vaults">Open Stax</Link>
            <a className="btn btn-ghost btn-lg" href="https://github.com/Bsh54/stax" target="_blank" rel="noreferrer">
              View the code
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
