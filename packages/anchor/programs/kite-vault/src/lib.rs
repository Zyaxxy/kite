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
        instructions::initialize_vault::initialize_vault_handler(ctx, name, symbol, fee_basis_points, asset_count)
    }

    pub fn deposit_basket(
        ctx: Context<DepositBasket>,
        usdc_amount_in: u64,
        min_basket_tokens_out: u64,
    ) -> Result<()> {
        instructions::deposit_basket::deposit_basket_handler(ctx, usdc_amount_in, min_basket_tokens_out)
    }

    pub fn redeem_basket(
        ctx: Context<RedeemBasket>,
        basket_tokens_to_burn: u64,
    ) -> Result<()> {
        instructions::redeem_basket::redeem_basket_handler(ctx, basket_tokens_to_burn)
    }

    pub fn create_sip(
        ctx: Context<CreateSip>,
        amount_per_cycle: u64,
        interval_seconds: u64,
    ) -> Result<()> {
        instructions::create_sip::create_sip_handler(ctx, amount_per_cycle, interval_seconds)
    }

    pub fn execute_sip(ctx: Context<ExecuteSip>) -> Result<()> {
        instructions::execute_sip::execute_sip_handler(ctx)
    }

    pub fn cancel_sip(ctx: Context<CancelSip>) -> Result<()> {
        instructions::cancel_sip::cancel_sip_handler(ctx)
    }
}
