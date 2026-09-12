# Stax

**Yield-bearing tokenized stocks on Solana.**

Tokenized stocks (e.g. NVDAx, AAPLx) currently sit idle in wallets — holding them
onchain earns nothing. Stax turns a tokenized stock into a productive asset: deposit
your stock, keep your price exposure, and earn yield on top — something a traditional
brokerage cannot offer.

Built for the [Stocklana](https://hackathons.solana.com/hackathons/stocklana) hackathon
(track: *Credit and yield*).

## How it works

1. **Deposit** a tokenized stock into its vault and receive share tokens.
2. The vault uses the stock as collateral to borrow stablecoins on a lending market
   and deploys them into a mature stablecoin yield strategy *(harvest — in progress)*.
3. The net spread accrues to the vault, so each share is redeemable for more stock over
   time.
4. **Withdraw** at any time by burning shares.

Shares follow an ERC-4626-style model adapted to Solana's account model, with a virtual
offset to neutralize the first-deposit inflation attack. Tokenized stocks are Token-2022
mints (Scaled UI Amount), and all accounting is done in raw token units.

## Status

| Component | State |
| --- | --- |
| Vault core (`initialize_vault`, `deposit`, `withdraw`) | ✅ implemented + tested |
| Share math (virtual offset, checked u128) | ✅ unit-tested |
| Harvest (yield accrual, authority-gated) | ✅ implemented |
| Kamino CPI — deposit stock as collateral (`init_kamino_position`, `deploy_to_kamino`) | ✅ implemented |
| Kamino CPI — borrow stablecoin against collateral | 🚧 in progress |
| Integration tests (LiteSVM / Surfpool mainnet fork) | 🚧 in progress |
| Frontend | 🚧 planned |

## Repository layout

```
programs/stax/src/
├── lib.rs              # program entrypoint and instruction routing
├── constants.rs        # PDA seeds and virtual-offset constants
├── error.rs            # custom error codes
├── state.rs            # Vault account
├── instructions/       # one handler per instruction
│   ├── initialize_vault.rs
│   ├── deposit.rs
│   └── withdraw.rs
└── utils/math.rs       # share <-> asset conversion (unit-tested)
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

## Security

- Signer and owner checks via Anchor typed accounts; `has_one` ties the vault to its
  stock mint, share mint, and stock vault.
- Checked arithmetic everywhere; `overflow-checks` enabled in the release profile.
- Cross-program calls validate the token program via the token interface.

## License

MIT
