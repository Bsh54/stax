//! Minimal, hand-built CPI layer for Kamino Lending (klend).
//!
//! `declare_program!` cannot be used here: klend's large account structs
//! (`Reserve`, `Obligation`, `LendingMarket`) blow past the BPF 4 KB stack
//! frame limit when their generated deserializers are pulled into this program.
//! Instead we build the raw `Instruction`s by hand (discriminator, Borsh args,
//! ordered account metas) and dispatch them with `invoke_signed`, which never
//! touches klend's account layouts.
//!
//! Account orders and discriminators mirror the klend IDL exactly; see
//! `idls/kamino_lending.json`.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

/// Kamino Lending program ID (mainnet).
pub const KLEND_PROGRAM_ID: Pubkey = pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

/// Instruction discriminators, copied verbatim from the klend IDL.
pub mod discriminator {
    pub const INIT_USER_METADATA: [u8; 8] = [117, 169, 176, 69, 197, 23, 15, 162];
    pub const INIT_OBLIGATION: [u8; 8] = [251, 10, 231, 76, 27, 11, 159, 96];
    pub const DEPOSIT_RESERVE_LIQUIDITY_AND_OBLIGATION_COLLATERAL_V2: [u8; 8] =
        [216, 224, 191, 27, 204, 151, 102, 175];
    pub const BORROW_OBLIGATION_LIQUIDITY_V2: [u8; 8] = [161, 128, 143, 245, 171, 199, 194, 6];
}

/// Build a klend instruction and dispatch it, signed by the vault PDA.
///
/// `data` must already contain the 8-byte discriminator followed by the
/// Borsh-encoded arguments. `metas` and `infos` must be in the exact order the
/// klend IDL lists them for the instruction.
pub fn invoke_klend_signed<'info>(
    data: Vec<u8>,
    metas: Vec<AccountMeta>,
    infos: &[AccountInfo<'info>],
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let ix = Instruction {
        program_id: KLEND_PROGRAM_ID,
        accounts: metas,
        data,
    };
    invoke_signed(&ix, infos, signer_seeds)?;
    Ok(())
}
