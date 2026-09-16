use anchor_lang::prelude::*;
use crate::constants::*;

#[account]
pub struct Plan {
    pub version: u8,
    pub devnet_mock: bool,
    pub owner: Pubkey,
    pub funding_mint: Pubkey,
    pub nonce: u64,
    pub funding_amount: u64,
    pub period_seconds: u64,
    pub starts_at: i64,
    pub expires_at: i64,
    pub periods: u16,
    pub executed_periods: u16,
    pub last_executed_period: u16,
    pub last_executed_at: i64,
    pub subscription_authority: Pubkey,
    pub recurring_delegation: Pubkey,
    pub subscription_init_id: i64,
    pub bump: u8,
    pub outputs: Vec<Output>,
}
impl Plan {
    pub const MAX_SIZE: usize = 197 + MAX_OUTPUT_ASSETS * 42;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Output {
    pub mint: Pubkey,
    pub weight_bps: u16,
    pub minimum_amount_out: u64,
}

#[derive(Debug)]
pub struct DelegationData {
    pub owner: Pubkey,
    pub delegatee: Pubkey,
    pub payer: Pubkey,
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub init_id: i64,
    pub current_period_start: i64,
    pub period_seconds: u64,
    pub expires_at: i64,
    pub amount: u64,
    pub pulled: u64,
}
