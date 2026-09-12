use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_spl::token_interface::Mint;

use crate::{
    constants::*,
    error::StaxError,
    kamino::{discriminator, invoke_klend_signed},
    state::Vault,
};

/// One-time Kamino setup for a vault: create the vault's `UserMetadata` and its
/// lending `Obligation`, both owned by the vault PDA.
///
/// Runs `init_user_metadata` then `init_obligation` as signed CPIs. The vault
/// PDA is the obligation owner; the authority is the fee payer that funds the new
/// klend accounts. klend derives `user_metadata` and `obligation` as PDAs, so
/// they are passed as unchecked accounts and validated by klend.
#[derive(Accounts)]
pub struct InitKaminoPosition<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, stock_mint.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ StaxError::Unauthorized,
        has_one = stock_mint,
    )]
    pub vault: Account<'info, Vault>,

    pub stock_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: klend UserMetadata PDA for the vault; validated by klend.
    #[account(mut)]
    pub user_metadata: UncheckedAccount<'info>,
    /// CHECK: optional referrer metadata (klend program id when none); validated by klend.
    pub referrer_user_metadata: UncheckedAccount<'info>,
    /// CHECK: klend obligation PDA, owned by the vault; validated by klend.
    #[account(mut)]
    pub obligation: UncheckedAccount<'info>,
    /// CHECK: klend lending market; validated by klend.
    pub lending_market: UncheckedAccount<'info>,
    /// CHECK: obligation seed 1 (klend program id for the default market); validated by klend.
    pub seed1_account: UncheckedAccount<'info>,
    /// CHECK: obligation seed 2 (klend program id for the default market); validated by klend.
    pub seed2_account: UncheckedAccount<'info>,

    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_kamino_position(
    ctx: Context<InitKaminoPosition>,
    tag: u8,
    id: u8,
    user_lookup_table: Pubkey,
) -> Result<()> {
    let a = &ctx.accounts;
    let stock_mint_key = a.stock_mint.key();
    let bump = a.vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, stock_mint_key.as_ref(), &[bump]]];

    // --- init_user_metadata ---
    let mut data = discriminator::INIT_USER_METADATA.to_vec();
    data.extend_from_slice(user_lookup_table.as_ref());
    let metas = vec![
        AccountMeta::new_readonly(a.vault.key(), true), // owner (vault PDA)
        AccountMeta::new(a.authority.key(), true),      // fee_payer
        AccountMeta::new(a.user_metadata.key(), false),
        AccountMeta::new_readonly(a.referrer_user_metadata.key(), false),
        AccountMeta::new_readonly(a.rent.key(), false),
        AccountMeta::new_readonly(a.system_program.key(), false),
    ];
    let infos = [
        a.vault.to_account_info(),
        a.authority.to_account_info(),
        a.user_metadata.to_account_info(),
        a.referrer_user_metadata.to_account_info(),
        a.rent.to_account_info(),
        a.system_program.to_account_info(),
    ];
    invoke_klend_signed(data, metas, &infos, signer_seeds)?;

    // --- init_obligation (args: InitObligationArgs { tag, id }) ---
    let mut data = discriminator::INIT_OBLIGATION.to_vec();
    data.push(tag);
    data.push(id);
    let metas = vec![
        AccountMeta::new_readonly(a.vault.key(), true), // obligation_owner (vault PDA)
        AccountMeta::new(a.authority.key(), true),      // fee_payer
        AccountMeta::new(a.obligation.key(), false),
        AccountMeta::new_readonly(a.lending_market.key(), false),
        AccountMeta::new_readonly(a.seed1_account.key(), false),
        AccountMeta::new_readonly(a.seed2_account.key(), false),
        AccountMeta::new_readonly(a.user_metadata.key(), false),
        AccountMeta::new_readonly(a.rent.key(), false),
        AccountMeta::new_readonly(a.system_program.key(), false),
    ];
    let infos = [
        a.vault.to_account_info(),
        a.authority.to_account_info(),
        a.obligation.to_account_info(),
        a.lending_market.to_account_info(),
        a.seed1_account.to_account_info(),
        a.seed2_account.to_account_info(),
        a.user_metadata.to_account_info(),
        a.rent.to_account_info(),
        a.system_program.to_account_info(),
    ];
    invoke_klend_signed(data, metas, &infos, signer_seeds)?;

    msg!("Initialized Kamino obligation for vault");
    Ok(())
}
