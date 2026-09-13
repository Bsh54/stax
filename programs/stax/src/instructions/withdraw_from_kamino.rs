use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::{
    constants::*,
    error::StaxError,
    kamino::{discriminator, invoke_klend_signed, optional_meta},
    state::Vault,
};

/// Withdraw the vault's tokenized stock back from Kamino collateral.
///
/// Used when a user exits: once any debt against the position is repaid (see
/// `repay_to_kamino`), the vault pulls its stock out of the Kamino obligation and
/// back into its own token account, from where `withdraw` returns it to the user.
/// The obligation is owned by the vault PDA, which signs.
///
/// The caller must prepend Kamino's `refresh_reserve` and `refresh_obligation`
/// instructions. klend account order mirrors
/// `withdraw_obligation_collateral_and_redeem_reserve_collateral_v2`.
#[derive(Accounts)]
pub struct WithdrawFromKamino<'info> {
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

    /// Vault-owned destination that receives the stock; the CPI's
    /// `user_destination_liquidity`.
    #[account(mut, address = vault.stock_vault)]
    pub stock_vault: InterfaceAccount<'info, TokenAccount>,

    // --- klend accounts (validated by Kamino) ---
    /// CHECK: klend obligation, owned by the vault PDA; validated by klend.
    #[account(mut)]
    pub obligation: UncheckedAccount<'info>,
    /// CHECK: klend lending market; validated by klend.
    pub lending_market: UncheckedAccount<'info>,
    /// CHECK: klend lending market authority PDA; validated by klend.
    pub lending_market_authority: UncheckedAccount<'info>,
    /// CHECK: klend withdraw reserve (the stock reserve); validated by klend.
    #[account(mut)]
    pub withdraw_reserve: UncheckedAccount<'info>,
    /// CHECK: klend reserve collateral supply vault; validated by klend.
    #[account(mut)]
    pub reserve_source_collateral: UncheckedAccount<'info>,
    /// CHECK: klend reserve collateral mint; validated by klend.
    #[account(mut)]
    pub reserve_collateral_mint: UncheckedAccount<'info>,
    /// CHECK: klend reserve liquidity supply vault; validated by klend.
    #[account(mut)]
    pub reserve_liquidity_supply: UncheckedAccount<'info>,
    /// CHECK: unused placeholder in the v2 flow; validated by klend.
    pub placeholder_user_destination_collateral: UncheckedAccount<'info>,
    /// CHECK: SPL token program for the collateral side; validated by klend.
    pub collateral_token_program: UncheckedAccount<'info>,
    /// CHECK: token program for the liquidity (stock) side; validated by klend.
    pub liquidity_token_program: UncheckedAccount<'info>,
    /// CHECK: instructions sysvar; validated by klend.
    pub instruction_sysvar_account: UncheckedAccount<'info>,
    /// CHECK: klend farm user state (or klend program id when no farm); validated by klend.
    pub obligation_farm_user_state: UncheckedAccount<'info>,
    /// CHECK: klend reserve farm state (or klend program id when no farm); validated by klend.
    pub reserve_farm_state: UncheckedAccount<'info>,
    /// CHECK: klend farms program (or klend program id when no farm); validated by klend.
    pub farms_program: UncheckedAccount<'info>,
}

pub fn handle_withdraw_from_kamino(ctx: Context<WithdrawFromKamino>, amount: u64) -> Result<()> {
    require!(amount > 0, StaxError::ZeroAmount);

    let a = &ctx.accounts;

    // discriminator + Borsh(collateral_amount: u64)
    let mut data =
        discriminator::WITHDRAW_OBLIGATION_COLLATERAL_AND_REDEEM_RESERVE_COLLATERAL_V2.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    // Ordered exactly as the klend IDL lists the flattened accounts.
    let metas = vec![
        AccountMeta::new(a.vault.key(), true), // owner (vault PDA signer, writable)
        AccountMeta::new(a.obligation.key(), false),
        AccountMeta::new_readonly(a.lending_market.key(), false),
        AccountMeta::new_readonly(a.lending_market_authority.key(), false),
        AccountMeta::new(a.withdraw_reserve.key(), false),
        AccountMeta::new_readonly(a.stock_mint.key(), false), // reserve_liquidity_mint
        AccountMeta::new(a.reserve_source_collateral.key(), false),
        AccountMeta::new(a.reserve_collateral_mint.key(), false),
        AccountMeta::new(a.reserve_liquidity_supply.key(), false),
        AccountMeta::new(a.stock_vault.key(), false), // user_destination_liquidity
        AccountMeta::new_readonly(a.placeholder_user_destination_collateral.key(), false),
        AccountMeta::new_readonly(a.collateral_token_program.key(), false),
        AccountMeta::new_readonly(a.liquidity_token_program.key(), false),
        AccountMeta::new_readonly(a.instruction_sysvar_account.key(), false),
        optional_meta(a.obligation_farm_user_state.key()),
        optional_meta(a.reserve_farm_state.key()),
        AccountMeta::new_readonly(a.farms_program.key(), false),
    ];

    let infos = [
        a.vault.to_account_info(),
        a.obligation.to_account_info(),
        a.lending_market.to_account_info(),
        a.lending_market_authority.to_account_info(),
        a.withdraw_reserve.to_account_info(),
        a.stock_mint.to_account_info(),
        a.reserve_source_collateral.to_account_info(),
        a.reserve_collateral_mint.to_account_info(),
        a.reserve_liquidity_supply.to_account_info(),
        a.stock_vault.to_account_info(),
        a.placeholder_user_destination_collateral.to_account_info(),
        a.collateral_token_program.to_account_info(),
        a.liquidity_token_program.to_account_info(),
        a.instruction_sysvar_account.to_account_info(),
        a.obligation_farm_user_state.to_account_info(),
        a.reserve_farm_state.to_account_info(),
        a.farms_program.to_account_info(),
    ];

    let stock_mint_key = a.stock_mint.key();
    let bump = a.vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, stock_mint_key.as_ref(), &[bump]]];

    invoke_klend_signed(data, metas, &infos, signer_seeds)?;

    // The stock is back in stock_vault (liquid); reduce the deployed tally.
    let vault = &mut ctx.accounts.vault;
    vault.deployed_assets = vault
        .deployed_assets
        .checked_sub(amount)
        .ok_or(StaxError::MathOverflow)?;

    msg!("Withdrew {} stock collateral from Kamino", amount);
    Ok(())
}
