//! Integration tests.
//!
//! Full deposit/withdraw flows are exercised against mainnet-forked Token-2022
//! and lending programs with LiteSVM and Surfpool in a later phase. The share
//! math is covered by unit tests in `src/utils/math.rs`.

#[test]
fn program_id_is_declared() {
    // Sanity check that the program links and exposes its declared id.
    assert_ne!(stax::id(), anchor_lang::prelude::Pubkey::default());
}
