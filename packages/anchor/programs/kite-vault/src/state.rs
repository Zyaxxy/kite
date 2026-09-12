use anchor_lang::prelude::*;

#[account]
pub struct BasketVault {
    pub authority: Pubkey,
    pub basket_mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub fee_basis_points: u16,
    pub total_minted: u64,
    pub asset_count: u8,
    pub bump: u8,
}

impl BasketVault {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // basket_mint
        4 + 32 + // name string
        4 + 10 + // symbol string
        2 + // fee_basis_points
        8 + // total_minted
        1 + // asset_count
        1; // bump
}

#[account]
pub struct SipPosition {
    pub owner: Pubkey,
    pub target_basket: Pubkey,
    pub amount_per_cycle: u64,
    pub interval_seconds: u64,
    pub last_executed_timestamp: i64,
    pub total_cycles_executed: u32,
    pub is_active: bool,
    pub bump: u8,
}

impl SipPosition {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // target_basket
        8 + // amount_per_cycle
        8 + // interval_seconds
        8 + // last_executed_timestamp
        4 + // total_cycles_executed
        1 + // is_active
        1; // bump
}
