use anchor_lang::prelude::*;

#[error_code]
pub enum StaxError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Slippage exceeded: output below the requested minimum")]
    SlippageExceeded,
    #[msg("Insufficient assets in the vault")]
    InsufficientAssets,
    #[msg("Only the vault authority can perform this action")]
    Unauthorized,
}
