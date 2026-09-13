use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
use instructions::*;
use state::SipTerms;

// Local-development identity only. There is no configured mainnet deployment.
declare_id!("WUrZqhZgSHZ8R8F6zV4CD3LQUXUWffpkZQf6zBCCmEa");

#[program]
pub mod kite_vault {
    use super::*;

    pub fn create_sip(ctx: Context<CreateSip>, plan_id: u64, terms: SipTerms) -> Result<()> {
        instructions::create_sip::create_sip_handler(ctx, plan_id, terms)
    }

    pub fn execute_sip(ctx: Context<ExecuteSip>, output_amount: u64) -> Result<()> {
        instructions::execute_sip::execute_sip_handler(ctx, output_amount)
    }

    pub fn cancel_sip(ctx: Context<CancelSip>) -> Result<()> {
        instructions::cancel_sip::cancel_sip_handler(ctx)
    }
}
