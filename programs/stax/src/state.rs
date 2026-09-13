use anchor_lang::prelude::*;

/// A yield-bearing vault for a single tokenized stock.
///
/// Users deposit the underlying tokenized stock and receive share tokens that
/// represent a proportional claim on the vault's assets. The stock backing those
/// shares lives in one of two places, both counted in `total_assets`:
///  - liquid, sitting in `stock_vault` (available for withdrawals), or
///  - deployed as Kamino obligation collateral (tracked by `deployed_assets`),
///    where borrowing a stablecoin against it funds the yield strategy.
///
/// `total_assets = liquid + deployed_assets`, where `liquid = stock_vault.amount`.
/// When yield is harvested, `total_assets` grows while the share supply stays
/// constant, increasing the value of every share.
#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Authority allowed to manage the vault (deploy, borrow, harvest, etc.).
    pub authority: Pubkey,
    /// The tokenized stock accepted by this vault (a Token-2022 mint).
    pub stock_mint: Pubkey,
    /// The vault's share token mint (authority is the vault PDA).
    pub share_mint: Pubkey,
    /// Token account holding the liquid stock, owned by the vault PDA.
    pub stock_vault: Pubkey,
    /// Raw amount of stock under management (liquid + deployed).
    pub total_assets: u64,
    /// Raw amount of stock currently deployed as Kamino collateral.
    pub deployed_assets: u64,
    /// Cumulative yield swept into the vault over its lifetime (raw stock units).
    pub total_yield: u64,
    /// Bump seed for the vault PDA.
    pub bump: u8,
}
