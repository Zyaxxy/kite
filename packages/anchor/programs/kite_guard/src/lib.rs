use anchor_lang::prelude::*;

declare_id!("8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs");

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

#[cfg(test)]
mod tests;

use instructions::*;

#[program]
pub mod kite_guard {
    use super::*;


    pub fn create_plan(ctx: Context<CreatePlan>, data: CreatePlanData) -> Result<()> {
        instructions::create_plan(ctx, data)
    }

    pub fn execute_swap<'info>(
        ctx: Context<'info, ExecuteSwap<'info>>,
        expected_period: u16,
    ) -> Result<()> {
        instructions::execute_swap(ctx, expected_period)
    }

    pub fn close_plan(ctx: Context<ClosePlan>) -> Result<()> {
        instructions::close_plan(ctx)
    }
}
