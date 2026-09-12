use anchor_lang::prelude::*;

/// A yield-bearing vault for a single tokenized stock.
///
/// Users deposit the underlying tokenized stock and receive share tokens that
/// represent a proportional claim on the vault's assets. When yield is harvested
/// (future work: borrow against the stock on a lending market and deploy the
/// proceeds into a stablecoin strategy), `total_assets` grows while the share
/// supply stays constant, increasing the value of every share.
#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Authority allowed to manage the vault (harvest, pause, etc.).
    pub authority: Pubkey,
    /// The tokenized stock accepted by this vault (a Token-2022 mint).
    pub stock_mint: Pubkey,
    /// The vault's share token mint (authority is the vault PDA).
    pub share_mint: Pubkey,
    /// Token account holding the deposited stock, owned by the vault PDA.
    pub stock_vault: Pubkey,
    /// Raw amount of stock currently under management (stored accounting).
    pub total_assets: u64,
    /// Cumulative yield swept into the vault over its lifetime (raw stock units).
    pub total_yield: u64,
    /// Bump seed for the vault PDA.
    pub bump: u8,
}
