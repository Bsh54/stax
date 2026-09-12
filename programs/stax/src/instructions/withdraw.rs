use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Burn, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::*, error::StaxError, events::WithdrawEvent, state::Vault, utils::shares_to_assets,
};

/// Accounts for burning vault shares and redeeming the underlying stock.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, stock_mint.key().as_ref()],
        bump = vault.bump,
        has_one = stock_mint,
        has_one = share_mint,
        has_one = stock_vault,
    )]
    pub vault: Account<'info, Vault>,

    pub stock_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub share_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = stock_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_stock: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub stock_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = share_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_share: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>, shares: u64, min_assets_out: u64) -> Result<()> {
    require!(shares > 0, StaxError::ZeroAmount);

    let total_assets = ctx.accounts.vault.total_assets;
    let total_shares = ctx.accounts.share_mint.supply;

    let assets =
        shares_to_assets(shares, total_assets, total_shares).ok_or(StaxError::MathOverflow)?;
    require!(assets > 0, StaxError::ZeroAmount);
    require!(assets >= min_assets_out, StaxError::SlippageExceeded);
    require!(assets <= total_assets, StaxError::InsufficientAssets);

    // Burn the user's shares first (update-before-transfer).
    token_interface::burn(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.user_share.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        shares,
    )?;

    // Return the stock to the user, signed by the vault PDA.
    let bump = ctx.accounts.vault.bump;
    let stock_mint_key = ctx.accounts.stock_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, stock_mint_key.as_ref(), &[bump]]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.stock_vault.to_account_info(),
                mint: ctx.accounts.stock_mint.to_account_info(),
                to: ctx.accounts.user_stock.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        assets,
        ctx.accounts.stock_mint.decimals,
    )?;

    ctx.accounts.vault.total_assets = total_assets
        .checked_sub(assets)
        .ok_or(StaxError::MathOverflow)?;

    emit!(WithdrawEvent {
        vault: ctx.accounts.vault.key(),
        user: ctx.accounts.user.key(),
        shares,
        assets,
    });

    msg!("Redeemed {} shares for {} stock", shares, assets);
    Ok(())
}
