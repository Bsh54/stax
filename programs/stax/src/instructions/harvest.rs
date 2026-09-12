use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{constants::*, error::StaxError, events::HarvestEvent, state::Vault};

/// Accounts for harvesting realized yield into the vault.
///
/// Yield is produced off the vault's stored accounting: a strategy returns
/// additional stock to the vault's token account (in production, the proceeds of
/// borrowing against the collateral and deploying them into a stablecoin yield
/// strategy, converted back to the underlying). `harvest` reconciles the stored
/// `total_assets` up to the vault's actual balance, so every share becomes
/// redeemable for more stock. Only the vault authority may call it.
#[derive(Accounts)]
pub struct Harvest<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, stock_mint.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ StaxError::Unauthorized,
        has_one = stock_mint,
        has_one = stock_vault,
    )]
    pub vault: Account<'info, Vault>,

    pub stock_mint: InterfaceAccount<'info, Mint>,

    #[account(address = vault.stock_vault)]
    pub stock_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_harvest(ctx: Context<Harvest>) -> Result<()> {
    let actual_balance = ctx.accounts.stock_vault.amount;
    let recorded = ctx.accounts.vault.total_assets;

    // Any surplus over the stored accounting is realized yield.
    let yield_amount = actual_balance.saturating_sub(recorded);
    require!(yield_amount > 0, StaxError::NothingToHarvest);

    let vault = &mut ctx.accounts.vault;
    vault.total_assets = actual_balance;
    vault.total_yield = vault
        .total_yield
        .checked_add(yield_amount)
        .ok_or(StaxError::MathOverflow)?;

    emit!(HarvestEvent {
        vault: vault.key(),
        yield_amount,
        total_assets: vault.total_assets,
    });

    msg!(
        "Harvested {} stock; total assets now {}",
        yield_amount,
        vault.total_assets
    );
    Ok(())
}
