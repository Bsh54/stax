pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod kamino;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;

declare_id!("DWqrx3j2gJYGEc4VfB1RjRtu4K8fx32Font6DWhckm6i");

/// Stax: yield-bearing tokenized stocks on Solana.
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

    /// One-time Kamino setup: create the vault's obligation and user metadata.
    pub fn init_kamino_position(
        ctx: Context<InitKaminoPosition>,
        tag: u8,
        id: u8,
        user_lookup_table: Pubkey,
    ) -> Result<()> {
        instructions::init_kamino_position::handle_init_kamino_position(
            ctx,
            tag,
            id,
            user_lookup_table,
        )
    }

    /// Deposit the vault's tokenized stock into Kamino as obligation collateral.
    pub fn deploy_to_kamino(ctx: Context<DeployToKamino>, amount: u64) -> Result<()> {
        instructions::deploy_to_kamino::handle_deploy_to_kamino(ctx, amount)
    }

    /// Borrow a stablecoin against the vault's Kamino collateral.
    pub fn borrow_from_kamino(ctx: Context<BorrowFromKamino>, amount: u64) -> Result<()> {
        instructions::borrow_from_kamino::handle_borrow_from_kamino(ctx, amount)
    }
}
