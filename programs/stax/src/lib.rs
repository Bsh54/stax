pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;

declare_id!("DWqrx3j2gJYGEc4VfB1RjRtu4K8fx32Font6DWhckm6i");

/// Stax — yield-bearing tokenized stocks on Solana.
///
/// Deposit a tokenized stock, receive shares, and (in later phases) earn yield
/// on an asset that would otherwise sit idle in a wallet.
#[program]
pub mod stax {
    use super::*;

    /// Create a new vault for a given tokenized-stock mint.
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault::handle_initialize_vault(ctx)
    }

    /// Deposit tokenized stock and mint vault shares.
    pub fn deposit(ctx: Context<Deposit>, amount: u64, min_shares_out: u64) -> Result<()> {
        instructions::deposit::handle_deposit(ctx, amount, min_shares_out)
    }

    /// Burn vault shares and redeem the underlying tokenized stock.
    pub fn withdraw(ctx: Context<Withdraw>, shares: u64, min_assets_out: u64) -> Result<()> {
        instructions::withdraw::handle_withdraw(ctx, shares, min_assets_out)
    }

    /// Sweep realized yield into the vault, increasing the value of every share.
    pub fn harvest(ctx: Context<Harvest>) -> Result<()> {
        instructions::harvest::handle_harvest(ctx)
    }
}
