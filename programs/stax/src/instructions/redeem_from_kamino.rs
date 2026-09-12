use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::{
    constants::*,
    error::StaxError,
    kamino::{discriminator, invoke_klend_signed},
    state::Vault,
};

/// Redeem the vault's Kamino reserve collateral (cTokens) back into stablecoin.
///
/// The inverse of `supply_to_kamino`: burns the reserve collateral the vault
/// holds and returns the underlying stablecoin plus accrued yield to the vault.
/// Used to free up stablecoin to repay debt (deleverage) or to realize yield.
/// Signed by the vault PDA.
///
/// The caller must prepend Kamino's `refresh_reserve` instruction. klend account
/// order mirrors `redeem_reserve_collateral`.
#[derive(Accounts)]
pub struct RedeemFromKamino<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, stock_mint.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ StaxError::Unauthorized,
        has_one = stock_mint,
    )]
    pub vault: Account<'info, Vault>,

    pub stock_mint: InterfaceAccount<'info, Mint>,

    /// Vault-owned reserve collateral (cTokens) source; the CPI's
    /// `user_source_collateral`.
    #[account(mut, token::authority = vault)]
    pub ctoken_vault: InterfaceAccount<'info, TokenAccount>,

    /// Vault-owned stablecoin destination; the CPI's `user_destination_liquidity`.
    #[account(mut, token::authority = vault)]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,

    // --- klend accounts (validated by Kamino) ---
    /// CHECK: klend lending market; validated by klend.
    pub lending_market: UncheckedAccount<'info>,
    /// CHECK: klend reserve to redeem from; validated by klend.
    #[account(mut)]
    pub reserve: UncheckedAccount<'info>,
    /// CHECK: klend lending market authority PDA; validated by klend.
    pub lending_market_authority: UncheckedAccount<'info>,
    /// CHECK: reserve liquidity mint (stablecoin); validated by klend.
    pub reserve_liquidity_mint: UncheckedAccount<'info>,
    /// CHECK: klend reserve collateral mint; validated by klend.
    #[account(mut)]
    pub reserve_collateral_mint: UncheckedAccount<'info>,
    /// CHECK: klend reserve liquidity supply vault; validated by klend.
    #[account(mut)]
    pub reserve_liquidity_supply: UncheckedAccount<'info>,
    /// CHECK: SPL token program for the collateral side; validated by klend.
    pub collateral_token_program: UncheckedAccount<'info>,
    /// CHECK: token program for the liquidity (stablecoin) side; validated by klend.
    pub liquidity_token_program: UncheckedAccount<'info>,
    /// CHECK: instructions sysvar; validated by klend.
    pub instruction_sysvar_account: UncheckedAccount<'info>,
}

pub fn handle_redeem_from_kamino(ctx: Context<RedeemFromKamino>, amount: u64) -> Result<()> {
    require!(amount > 0, StaxError::ZeroAmount);
    require!(
        amount <= ctx.accounts.ctoken_vault.amount,
        StaxError::InsufficientAssets
    );

    let a = &ctx.accounts;

    // discriminator + Borsh(collateral_amount: u64)
    let mut data = discriminator::REDEEM_RESERVE_COLLATERAL.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    // Ordered exactly as the klend IDL lists the accounts.
    let metas = vec![
        AccountMeta::new_readonly(a.vault.key(), true), // owner (vault PDA signer)
        AccountMeta::new_readonly(a.lending_market.key(), false),
        AccountMeta::new(a.reserve.key(), false),
        AccountMeta::new_readonly(a.lending_market_authority.key(), false),
        AccountMeta::new_readonly(a.reserve_liquidity_mint.key(), false),
        AccountMeta::new(a.reserve_collateral_mint.key(), false),
        AccountMeta::new(a.reserve_liquidity_supply.key(), false),
        AccountMeta::new(a.ctoken_vault.key(), false), // user_source_collateral
        AccountMeta::new(a.usdc_vault.key(), false),   // user_destination_liquidity
        AccountMeta::new_readonly(a.collateral_token_program.key(), false),
        AccountMeta::new_readonly(a.liquidity_token_program.key(), false),
        AccountMeta::new_readonly(a.instruction_sysvar_account.key(), false),
    ];

    let infos = [
        a.vault.to_account_info(),
        a.lending_market.to_account_info(),
        a.reserve.to_account_info(),
        a.lending_market_authority.to_account_info(),
        a.reserve_liquidity_mint.to_account_info(),
        a.reserve_collateral_mint.to_account_info(),
        a.reserve_liquidity_supply.to_account_info(),
        a.ctoken_vault.to_account_info(),
        a.usdc_vault.to_account_info(),
        a.collateral_token_program.to_account_info(),
        a.liquidity_token_program.to_account_info(),
        a.instruction_sysvar_account.to_account_info(),
    ];

    let stock_mint_key = a.stock_mint.key();
    let bump = a.vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, stock_mint_key.as_ref(), &[bump]]];

    invoke_klend_signed(data, metas, &infos, signer_seeds)?;

    msg!("Redeemed {} reserve collateral from Kamino", amount);
    Ok(())
}
