use anchor_lang::prelude::*;

pub const PROTOCOL_VERSION: u8 = 2;
pub const TOTAL_WEIGHT_BPS: u16 = 10_000;
pub const MAX_OUTPUT_ASSETS: usize = 20;
pub const MIN_PERIOD_SECONDS: u64 = 60;
pub const MAX_DURATION_SECONDS: u64 = 31_536_000;
pub const NO_EXECUTED_PERIOD: u16 = u16::MAX;
pub const SUBSCRIPTIONS_PROGRAM: Pubkey = pubkey!("De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44");
pub const ASSOCIATED_TOKEN_PROGRAM: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const MOCK_MINT_AUTHORITY_SEED: &[u8] = b"mock_mint_authority";
pub const MOCK_ROUTE_ACCOUNTS: usize = 2;
