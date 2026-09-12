use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{constants::*, state::Vault};

/// Accounts for creating a new vault bound to a single tokenized stock.
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The tokenized stock this vault will accept.
    pub stock_mint: InterfaceAccount<'info, Mint>,

    /// Vault state PDA, unique per stock mint.
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, stock_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// Share mint controlled by the vault PDA. Matches the stock's decimals.
    #[account(
        init,
        payer = authority,
        seeds = [SHARE_SEED, stock_mint.key().as_ref()],
        bump,
        mint::decimals = stock_mint.decimals,
        mint::authority = vault,
        mint::freeze_authority = vault,
        mint::token_program = token_program,
    )]
    pub share_mint: InterfaceAccount<'info, Mint>,

    /// Associated token account (owned by the vault PDA) that holds deposits.
    #[account(
        init,
        payer = authority,
        associated_token::mint = stock_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub stock_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.authority = ctx.accounts.authority.key();
    vault.stock_mint = ctx.accounts.stock_mint.key();
    vault.share_mint = ctx.accounts.share_mint.key();
    vault.stock_vault = ctx.accounts.stock_vault.key();
    vault.total_assets = 0;
    vault.total_yield = 0;
    vault.bump = ctx.bumps.vault;

    msg!("Stax vault initialized for stock mint {}", vault.stock_mint);
    Ok(())
}
