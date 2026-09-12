use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::{
    constants::*,
    error::StaxError,
    kamino::{discriminator, invoke_klend_signed, optional_meta},
    state::Vault,
};

/// Repay part (or all) of the vault's stablecoin debt on Kamino.
///
/// This is the deleverage lever of the safety engine: when the collateral price
/// drops and the loan-to-value ratio climbs toward the danger zone, the vault
/// repays debt from its stablecoin holdings to restore a safe buffer, so the
/// position is never liquidated. It is also used to unwind before withdrawing the
/// underlying stock. The obligation is owned by the vault PDA, which signs.
///
/// The caller must prepend Kamino's `refresh_reserve` and `refresh_obligation`
/// instructions. klend account order mirrors `repay_obligation_liquidity_v2`.
#[derive(Accounts)]
pub struct RepayToKamino<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, stock_mint.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ StaxError::Unauthorized,
        has_one = stock_mint,
    )]
    pub vault: Account<'info, Vault>,

    pub stock_mint: InterfaceAccount<'info, Mint>,

    /// Vault-owned source of the stablecoin used to repay; the CPI's
    /// `user_source_liquidity`.
    #[account(mut, token::authority = vault)]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,

    // --- klend accounts (validated by Kamino) ---
    /// CHECK: klend obligation, owned by the vault PDA; validated by klend.
    #[account(mut)]
    pub obligation: UncheckedAccount<'info>,
    /// CHECK: klend lending market; validated by klend.
    pub lending_market: UncheckedAccount<'info>,
    /// CHECK: klend repay reserve (stablecoin); validated by klend.
    #[account(mut)]
    pub repay_reserve: UncheckedAccount<'info>,
    /// CHECK: repay reserve liquidity mint (stablecoin); validated by klend.
    pub reserve_liquidity_mint: UncheckedAccount<'info>,
    /// CHECK: klend reserve liquidity supply vault; validated by klend.
    #[account(mut)]
    pub reserve_destination_liquidity: UncheckedAccount<'info>,
    /// CHECK: token program for the stablecoin; validated by klend.
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: instructions sysvar; validated by klend.
    pub instruction_sysvar_account: UncheckedAccount<'info>,
    /// CHECK: klend farm user state (or klend program id when no farm); validated by klend.
    pub obligation_farm_user_state: UncheckedAccount<'info>,
    /// CHECK: klend reserve farm state (or klend program id when no farm); validated by klend.
    pub reserve_farm_state: UncheckedAccount<'info>,
    /// CHECK: klend lending market authority PDA; validated by klend.
    pub lending_market_authority: UncheckedAccount<'info>,
    /// CHECK: klend farms program (or klend program id when no farm); validated by klend.
    pub farms_program: UncheckedAccount<'info>,
}

pub fn handle_repay_to_kamino(ctx: Context<RepayToKamino>, amount: u64) -> Result<()> {
    require!(amount > 0, StaxError::ZeroAmount);

    let a = &ctx.accounts;

    // discriminator + Borsh(liquidity_amount: u64)
    let mut data = discriminator::REPAY_OBLIGATION_LIQUIDITY_V2.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    // Ordered exactly as the klend IDL lists the flattened accounts.
    let metas = vec![
        AccountMeta::new_readonly(a.vault.key(), true), // owner (vault PDA signer)
        AccountMeta::new(a.obligation.key(), false),
        AccountMeta::new_readonly(a.lending_market.key(), false),
        AccountMeta::new(a.repay_reserve.key(), false),
        AccountMeta::new_readonly(a.reserve_liquidity_mint.key(), false),
        AccountMeta::new(a.reserve_destination_liquidity.key(), false),
        AccountMeta::new(a.usdc_vault.key(), false), // user_source_liquidity
        AccountMeta::new_readonly(a.token_program.key(), false),
        AccountMeta::new_readonly(a.instruction_sysvar_account.key(), false),
        optional_meta(a.obligation_farm_user_state.key()),
        optional_meta(a.reserve_farm_state.key()),
        AccountMeta::new_readonly(a.lending_market_authority.key(), false),
        AccountMeta::new_readonly(a.farms_program.key(), false),
    ];

    let infos = [
        a.vault.to_account_info(),
        a.obligation.to_account_info(),
        a.lending_market.to_account_info(),
        a.repay_reserve.to_account_info(),
        a.reserve_liquidity_mint.to_account_info(),
        a.reserve_destination_liquidity.to_account_info(),
        a.usdc_vault.to_account_info(),
        a.token_program.to_account_info(),
        a.instruction_sysvar_account.to_account_info(),
        a.obligation_farm_user_state.to_account_info(),
        a.reserve_farm_state.to_account_info(),
        a.lending_market_authority.to_account_info(),
        a.farms_program.to_account_info(),
    ];

    let stock_mint_key = a.stock_mint.key();
    let bump = a.vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, stock_mint_key.as_ref(), &[bump]]];

    invoke_klend_signed(data, metas, &infos, signer_seeds)?;

    msg!("Repaid {} stablecoin to Kamino", amount);
    Ok(())
}
