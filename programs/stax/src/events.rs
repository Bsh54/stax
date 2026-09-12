use anchor_lang::prelude::*;

/// Emitted when a user deposits stock and receives shares.
#[event]
pub struct DepositEvent {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub assets: u64,
    pub shares: u64,
}

/// Emitted when a user burns shares and redeems stock.
#[event]
pub struct WithdrawEvent {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub shares: u64,
    pub assets: u64,
}

/// Emitted when realized yield is swept into the vault.
#[event]
pub struct HarvestEvent {
    pub vault: Pubkey,
    pub yield_amount: u64,
    pub total_assets: u64,
}
