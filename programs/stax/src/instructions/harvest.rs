use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{constants::*, error::StaxError, events::HarvestEvent, state::Vault};

/// Accounts for harvesting realized yield into the vault.
///
/// The yield strategy (borrow a stablecoin against the Kamino collateral, deploy
/// it into a stablecoin yield source, then convert the net proceeds back into the
/// underlying stock) returns that stock to `stock_vault`. Any liquid balance
/// beyond what should be liquid (`total_assets - deployed_assets`) is realized
/// yield: `harvest` credits it to `total_assets`, so every share becomes
/// redeemable for more stock. This works whether or not collateral is currently
/// deployed. Only the vault authority may call it.
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
    let liquid = ctx.accounts.stock_vault.amount;
    let total_assets = ctx.accounts.vault.total_assets;
    let deployed = ctx.accounts.vault.deployed_assets;

    // Stock that should be sitting liquid in the vault (the rest is deployed).
    let expected_liquid = total_assets.saturating_sub(deployed);
    // Any liquid balance beyond that is realized yield returned by the strategy.
    let yield_amount = liquid.saturating_sub(expected_liquid);
    require!(yield_amount > 0, StaxError::NothingToHarvest);

    let vault = &mut ctx.accounts.vault;
    vault.total_assets = total_assets
        .checked_add(yield_amount)
        .ok_or(StaxError::MathOverflow)?;
    vault.total_yield = vault
        .total_yield
        .checked_add(yield_amount)
        .ok_or(StaxError::MathOverflow)?;

    emit!(HarvestEvent {
        vault: vault.key(),
        yield_amount,
        total_assets: vault.total_assets,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Harvested {} stock; total assets now {}",
        yield_amount,
        vault.total_assets
    );
    Ok(())
}
