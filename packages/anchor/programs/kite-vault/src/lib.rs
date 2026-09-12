use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod instructions;

use instructions::*;

declare_id!("K1teVau1t1111111111111111111111111111111111");

#[program]
pub mod kite_vault {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        name: String,
        symbol: String,
        fee_basis_points: u16,
        asset_count: u8,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, name, symbol, fee_basis_points, asset_count)
    }

    pub fn deposit_basket(
        ctx: Context<DepositBasket>,
        usdc_amount_in: u64,
        min_basket_tokens_out: u64,
    ) -> Result<()> {
        instructions::deposit_basket::handler(ctx, usdc_amount_in, min_basket_tokens_out)
    }

    pub fn redeem_basket(
        ctx: Context<RedeemBasket>,
        basket_tokens_to_burn: u64,
    ) -> Result<()> {
        instructions::redeem_basket::handler(ctx, basket_tokens_to_burn)
    }
}
