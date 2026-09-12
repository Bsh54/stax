use anchor_lang::prelude::*;

/// PDA seed for a vault account (one vault per tokenized-stock mint).
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// PDA seed for a vault's share mint.
#[constant]
pub const SHARE_SEED: &[u8] = b"share";

/// Virtual shares offset used to mitigate the first-deposit inflation attack.
///
/// Paired with [`VIRTUAL_ASSETS`], this shifts the share/asset exchange rate so
/// that donating assets to an empty vault cannot be used to steal later
/// depositors' funds (OpenZeppelin ERC-4626 approach).
pub const VIRTUAL_SHARES: u128 = 1_000;

/// Virtual assets offset paired with [`VIRTUAL_SHARES`].
pub const VIRTUAL_ASSETS: u128 = 1;
