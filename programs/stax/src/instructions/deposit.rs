use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*, error::StaxError, events::DepositEvent, state::Vault, utils::assets_to_shares,
};

/// Accounts for depositing tokenized stock and minting vault shares.
#[derive(Accounts)]
pub struct Deposit<'info> {
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
        init_if_needed,
        payer = user,
        associated_token::mint = share_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_share: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount: u64, min_shares_out: u64) -> Result<()> {
    require!(amount > 0, StaxError::ZeroAmount);

    let total_assets = ctx.accounts.vault.total_assets;
    let total_shares = ctx.accounts.share_mint.supply;

    let shares =
        assets_to_shares(amount, total_assets, total_shares).ok_or(StaxError::MathOverflow)?;
    require!(shares > 0, StaxError::ZeroAmount);
    require!(shares >= min_shares_out, StaxError::SlippageExceeded);

    // Pull the tokenized stock from the user into the vault.
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.user_stock.to_account_info(),
                mint: ctx.accounts.stock_mint.to_account_info(),
                to: ctx.accounts.stock_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.stock_mint.decimals,
    )?;

    // Mint shares to the user, signed by the vault PDA.
    let bump = ctx.accounts.vault.bump;
    let stock_mint_key = ctx.accounts.stock_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, stock_mint_key.as_ref(), &[bump]]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.user_share.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        shares,
    )?;

    ctx.accounts.vault.total_assets = total_assets
        .checked_add(amount)
        .ok_or(StaxError::MathOverflow)?;

    emit!(DepositEvent {
        vault: ctx.accounts.vault.key(),
        user: ctx.accounts.user.key(),
        assets: amount,
        shares,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Deposited {} stock, minted {} shares", amount, shares);
    Ok(())
}
