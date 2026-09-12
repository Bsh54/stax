use crate::constants::{VIRTUAL_ASSETS, VIRTUAL_SHARES};

/// Convert an asset amount into vault shares at the current exchange rate.
///
/// Uses a virtual offset (OpenZeppelin ERC-4626 style) so the first-deposit
/// inflation attack is not economically viable. All intermediate math is done
/// in `u128` and checked for overflow; returns `None` on overflow.
pub fn assets_to_shares(assets: u64, total_assets: u64, total_shares: u64) -> Option<u64> {
    let numerator =
        (assets as u128).checked_mul((total_shares as u128).checked_add(VIRTUAL_SHARES)?)?;
    let denominator = (total_assets as u128).checked_add(VIRTUAL_ASSETS)?;
    let shares = numerator.checked_div(denominator)?;
    u64::try_from(shares).ok()
}

/// Convert a share amount back into the underlying asset amount.
///
/// Inverse of [`assets_to_shares`], using the same virtual offset. All
/// intermediate math is done in `u128` and checked for overflow.
pub fn shares_to_assets(shares: u64, total_assets: u64, total_shares: u64) -> Option<u64> {
    let numerator =
        (shares as u128).checked_mul((total_assets as u128).checked_add(VIRTUAL_ASSETS)?)?;
    let denominator = (total_shares as u128).checked_add(VIRTUAL_SHARES)?;
    let assets = numerator.checked_div(denominator)?;
    u64::try_from(assets).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_deposit_mints_shares() {
        // An empty vault should still mint a positive amount of shares.
        let shares = assets_to_shares(1_000_000, 0, 0).unwrap();
        assert!(shares > 0);
    }

    #[test]
    fn round_trip_never_creates_value() {
        // Converting assets -> shares -> assets must never return more than the
        // original amount (rounding must favor the vault, not the user).
        let (total_assets, total_shares) = (5_000_000u64, 5_000_000u64);
        let shares = assets_to_shares(1_000_000, total_assets, total_shares).unwrap();
        let assets_back = shares_to_assets(shares, total_assets, total_shares).unwrap();
        assert!(assets_back <= 1_000_000);
    }

    #[test]
    fn overflow_returns_none() {
        // Extreme inputs must be handled gracefully instead of panicking.
        assert!(assets_to_shares(u64::MAX, 0, u64::MAX).is_none());
    }
}
