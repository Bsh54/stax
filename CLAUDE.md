# Stax project rules

Yield-bearing tokenized stocks on Solana (Anchor program). Deposit a tokenized stock,
mint ERC-4626-style shares, earn yield (harvest via a lending market, in progress).

## Conventions
- All code, comments, and commit messages in **English**.
- **Conventional Commits**; imperative mood; no co-authorship trailers; no AI/Claude mentions.
- Modular Anchor layout: `instructions/` (one file per handler), `state.rs`, `error.rs`,
  `constants.rs`, `utils/`. Keep `lib.rs` as routing only.
- Checked math only on amounts/shares (`checked_*`). No `unwrap`/`expect` in program logic.
- Run `cargo fmt` and `cargo clippy` before every commit.

## Build & test
```bash
anchor build          # outputs target/deploy/stax.so + target/idl/stax.json
cargo test -p stax    # unit tests (utils/math.rs) + integration tests
cargo clippy -p stax
```

## Environment
- Development and builds run on a Linux VPS (Solana 3.1.10, Anchor 1.2.0, Rust 1.98 host,
  Surfpool 0.9.5). The local machine edits code and pushes to GitHub; files are synced to
  the VPS to compile and test.

## Project-specific pitfalls
- **`CpiContext::new` / `new_with_signer` take the program `Pubkey`** (not `AccountInfo`)
  in this Anchor version, pass `ctx.accounts.token_program.key()`.
- Tokenized stocks are **Token-2022 with Scaled UI Amount**: transact in **raw amounts**;
  the display multiplier is a frontend concern.
- Use `token_interface` (not `token`) so both SPL Token and Token-2022 are supported.
- Vault PDA signs mints/transfers: seeds `[VAULT_SEED, stock_mint, bump]`.

## Reference
Methodology and full guidelines live outside the repo in `../_reference/CODING_GUIDELINES.md`.
