# Stax

**Yield-bearing tokenized stocks on Solana.**

Tokenized stocks (e.g. NVDAx, AAPLx) currently sit idle in wallets: holding them
onchain earns nothing. Stax turns a tokenized stock into a productive asset. You
deposit your stock, keep your price exposure, and earn yield on top, something a
traditional brokerage cannot offer.

Built for the [Stocklana](https://hackathons.solana.com/hackathons/stocklana) hackathon
(track: *Credit and yield*).

**Live demo: https://stax.shadrakbessanh.me** (runs on a Solana mainnet fork with real Kamino and
xStocks; a built-in demo account and faucet let anyone deposit and withdraw with test funds, no
wallet setup required).

## How it works

1. **Deposit** a tokenized stock into its vault and receive share tokens.
2. The vault supplies the stock as collateral on Kamino and borrows a stablecoin
   against it, then deploys that stablecoin into a mature stablecoin yield source.
3. The net spread (strategy yield minus borrow cost) is harvested back into the vault,
   so each share is redeemable for more stock over time.
4. **Withdraw** at any time by burning shares.

Shares follow an ERC-4626-style model adapted to Solana's account model, with a virtual
offset to neutralize the first-deposit inflation attack. Tokenized stocks are Token-2022
mints (Scaled UI Amount), and all accounting is done in raw token units.

### Accounting model

The stock backing the shares lives in one of two places, both counted in
`total_assets`:

- **liquid**, sitting in the vault's `stock_vault` token account (available for
  withdrawals), or
- **deployed** as Kamino collateral (tracked by `deployed_assets`).

So `total_assets = liquid + deployed_assets`, and share value is
`total_assets / share_supply`. Deposits and withdrawals price shares off the stored
`total_assets` (not a live token balance), which makes the vault resistant to
direct-donation exchange-rate manipulation. `harvest` credits only the stock returned
to the vault beyond the expected liquid amount (`total_assets - deployed_assets`), so
it stays correct whether or not collateral is currently deployed.

Deploying collateral and borrowing are authority-driven (a keeper/strategy layer,
in the spirit of DeFi Saver's automated position management), while a liquidity
buffer of undeployed stock is kept in `stock_vault` to serve withdrawals.

## Status

| Component | State |
| --- | --- |
| Vault core (`initialize_vault`, `deposit`, `withdraw`) | implemented + tested |
| Share math (virtual offset, checked u128) | unit-tested |
| Harvest (yield accrual, authority-gated) | implemented |
| Kamino CPI: deposit stock as collateral (`init_kamino_position`, `deploy_to_kamino`) | implemented |
| Kamino CPI: borrow stablecoin against collateral (`borrow_from_kamino`) | implemented |
| Integration tests (LiteSVM / Surfpool mainnet fork) | in progress |
| Frontend | planned |

## Repository layout

```
programs/stax/src/
├── lib.rs              # program entrypoint and instruction routing
├── constants.rs        # PDA seeds and virtual-offset constants
├── error.rs            # custom error codes
├── state.rs            # Vault account
├── kamino.rs           # hand-built klend CPI layer (discriminators, invoke helper)
├── instructions/       # one handler per instruction
│   ├── initialize_vault.rs
│   ├── deposit.rs
│   ├── withdraw.rs
│   ├── harvest.rs
│   ├── init_kamino_position.rs
│   ├── deploy_to_kamino.rs
│   ├── borrow_from_kamino.rs
│   ├── repay_to_kamino.rs
│   ├── supply_to_kamino.rs
│   ├── redeem_from_kamino.rs
│   └── withdraw_from_kamino.rs
└── utils/math.rs       # share to asset conversion (unit-tested)
```

## Build & test

Requires the Solana toolchain, Anchor, and Rust.

```bash
anchor build          # compile the program (outputs target/deploy/stax.so)
cargo test -p stax    # run unit and integration tests
```

## Instructions

| Instruction | Description |
| --- | --- |
| `initialize_vault` | Create a vault for a tokenized-stock mint (also creates the share mint and stock vault). |
| `deposit(amount, min_shares_out)` | Deposit stock, mint shares (with slippage protection). |
| `withdraw(shares, min_assets_out)` | Burn shares, redeem the underlying stock. |
| `harvest` | Sweep realized yield into the vault (authority only), raising the value of every share. |
| `init_kamino_position(tag, id, lut)` | One-time Kamino setup: create the vault's obligation and user metadata (owned by the vault PDA). |
| `deploy_to_kamino(amount)` | Supply the vault's stock to Kamino as obligation collateral. |
| `borrow_from_kamino(amount)` | Borrow a stablecoin against the vault's Kamino collateral. |
| `supply_to_kamino(amount)` | Supply the borrowed stablecoin into a Kamino reserve to earn yield. |
| `redeem_from_kamino(amount)` | Redeem the reserve collateral back into stablecoin. |
| `repay_to_kamino(amount)` | Repay stablecoin debt (deleverage / unwind before withdrawal). |
| `withdraw_from_kamino(amount)` | Pull the vault's stock back out of Kamino collateral. |

## Security

- Signer and owner checks via Anchor typed accounts; `has_one` ties the vault to its
  stock mint, share mint, and stock vault.
- Checked arithmetic everywhere; `overflow-checks` enabled in the release profile.
- Cross-program calls validate the token program via the token interface.
- Kamino positions (obligation and user metadata) are owned by the vault PDA, so only
  this program can manage them.
- Manual klend CPIs target a hardcoded program id (no user-supplied program), which
  rules out the arbitrary-CPI class of attacks; optional klend accounts use the program
  id placeholder and stay read-only.
- Share pricing reads stored `total_assets`, not a live token balance, making the vault
  resistant to direct-donation exchange-rate manipulation.

### Assumptions and roadmap

- **No transfer-fee mints.** Accounting assumes the deposited amount equals the amount
  received (true for xStocks, which use Scaled UI Amount, not the transfer-fee
  extension). A transfer-fee mint would require post-transfer balance reconciliation.
- **Upgrade authority.** For mainnet the program upgrade authority should move to a
  Squads multisig (single-key authority is for local/testing only).
- `init_if_needed` is used only for the user's share associated-token account (a
  deterministic ATA), the standard safe use of the constraint.

## License

MIT
