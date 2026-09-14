use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

declare_id!("8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs");

pub const TOTAL_WEIGHT_BPS: u16 = 10_000;
pub const MAX_OUTPUT_ASSETS: usize = 20;
pub const MIN_PERIOD_SECONDS: u64 = 60; // 60s minimum for devnet/testing; production defaults to daily (86400s)

#[program]
pub mod kite_guard {
    use super::*;

    /// Create a guarded recurring investment plan with validated target weights.
    pub fn create_plan(ctx: Context<CreatePlan>, data: CreatePlanData) -> Result<()> {
        require!(data.funding_amount > 0, KiteGuardError::InvalidAmount);
        require!(data.periods > 0, KiteGuardError::InvalidPeriods);
        require!(
            data.period_seconds >= MIN_PERIOD_SECONDS,
            KiteGuardError::PeriodTooShort
        );
        require!(
            !data.outputs.is_empty() && data.outputs.len() <= MAX_OUTPUT_ASSETS,
            KiteGuardError::InvalidOutputsCount
        );

        let mut total_weight: u16 = 0;
        for output in &data.outputs {
            require!(output.weight_bps > 0, KiteGuardError::InvalidAllocationWeights);
            total_weight = total_weight
                .checked_add(output.weight_bps)
                .ok_or(KiteGuardError::WeightOverflow)?;
        }
        require!(
            total_weight == TOTAL_WEIGHT_BPS,
            KiteGuardError::InvalidAllocationWeights
        );

        let clock = Clock::get()?;
        let plan = &mut ctx.accounts.plan;
        plan.owner = ctx.accounts.owner.key();
        plan.funding_mint = ctx.accounts.funding_mint.key();
        plan.funding_amount = data.funding_amount;
        plan.period_seconds = data.period_seconds;
        plan.periods = data.periods;
        plan.executed_periods = 0;
        plan.last_executed_at = clock.unix_timestamp;
        plan.outputs = data.outputs;
        plan.subscription_authority = ctx.accounts.subscription_authority.key();
        plan.bump = ctx.bumps.plan;

        emit!(PlanCreated {
            plan: plan.key(),
            owner: plan.owner,
            funding_mint: plan.funding_mint,
            funding_amount: plan.funding_amount,
            period_seconds: plan.period_seconds,
            periods: plan.periods,
        });
        Ok(())
    }

    /// Cranker entrypoint. Executes a scheduled recurring purchase period.
    /// Checks elapsed time intervals, advances plan state, and records execution.
    pub fn execute_swap(ctx: Context<ExecuteSwap>, _plan_id: u64) -> Result<()> {
        let clock = Clock::get()?;
        let plan = &mut ctx.accounts.plan;

        require!(
            plan.executed_periods < plan.periods,
            KiteGuardError::PlanAlreadyCompleted
        );

        // Verify scheduled period interval has elapsed
        let min_next_execution = plan
            .last_executed_at
            .checked_add(plan.period_seconds as i64)
            .ok_or(KiteGuardError::CalculationOverflow)?;
        require!(
            clock.unix_timestamp >= min_next_execution,
            KiteGuardError::PeriodNotElapsed
        );

        // Verify source token matches plan's funding mint
        require_keys_eq!(
            ctx.accounts.source_token.mint,
            plan.funding_mint,
            KiteGuardError::MismatchedFundingMint
        );

        // Advance executed periods and stamp execution time
        plan.executed_periods = plan
            .executed_periods
            .checked_add(1)
            .ok_or(KiteGuardError::CalculationOverflow)?;
        plan.last_executed_at = clock.unix_timestamp;

        emit!(SwapExecuted {
            plan: plan.key(),
            period: plan.executed_periods,
            output_mint: ctx.accounts.output_mint.key(),
            funding_amount: plan.funding_amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Cancel a recurring plan and reclaim the account rent lamports back to the owner.
    pub fn close_plan(ctx: Context<ClosePlan>) -> Result<()> {
        let plan = &ctx.accounts.plan;
        emit!(PlanClosed {
            plan: plan.key(),
            owner: ctx.accounts.owner.key(),
            reclaimed_periods: plan.periods.saturating_sub(plan.executed_periods),
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreatePlan<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub funding_mint: Account<'info, Mint>,
    /// CHECK: validated by the subscriptions program.
    pub subscription_authority: AccountInfo<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Plan::MAX_SIZE,
        seeds = [b"plan", owner.key().as_ref(), funding_mint.key().as_ref()],
        bump
    )]
    pub plan: Account<'info, Plan>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(plan_id: u64)]
pub struct ExecuteSwap<'info> {
    #[account(mut)]
    pub cranker: Signer<'info>,
    #[account(
        mut,
        seeds = [b"plan", plan.owner.as_ref(), plan.funding_mint.as_ref()],
        bump = plan.bump,
    )]
    pub plan: Account<'info, Plan>,
    /// CHECK: the subscription program id.
    pub subscription_program: AccountInfo<'info>,
    /// CHECK: the authority PDA owned by the subscription program.
    pub subscription_authority: AccountInfo<'info>,
    /// CHECK: the recurring delegation account.
    pub recurring_delegation: AccountInfo<'info>,
    #[account(mut)]
    pub source_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_funding_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner_output_token: Account<'info, TokenAccount>,
    pub output_mint: Account<'info, Mint>,
    /// CHECK: instruction accounts or parameters for CPI routing.
    pub subscription_instruction: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ClosePlan<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"plan", owner.key().as_ref(), plan.funding_mint.as_ref()],
        bump = plan.bump,
        has_one = owner,
        close = owner,
    )]
    pub plan: Account<'info, Plan>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreatePlanData {
    pub funding_amount: u64,
    pub period_seconds: u64,
    pub periods: u16,
    pub outputs: Vec<Output>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Output {
    pub mint: Pubkey,
    pub weight_bps: u16,
}

#[account]
pub struct Plan {
    pub owner: Pubkey,
    pub funding_mint: Pubkey,
    pub funding_amount: u64,
    pub period_seconds: u64,
    pub last_executed_at: i64,
    pub periods: u16,
    pub executed_periods: u16,
    pub subscription_authority: Pubkey,
    pub bump: u8,
    pub outputs: Vec<Output>,
}

impl Plan {
    pub const MAX_SIZE: usize = 32 // owner
        + 32 // funding_mint
        + 8  // funding_amount
        + 8  // period_seconds
        + 8  // last_executed_at
        + 2  // periods
        + 2  // executed_periods
        + 32 // subscription_authority
        + 1  // bump
        + 4  // vec prefix
        + (MAX_OUTPUT_ASSETS * (32 + 2)); // 20 * 34 = 680
}

#[event]
pub struct PlanCreated {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub funding_mint: Pubkey,
    pub funding_amount: u64,
    pub period_seconds: u64,
    pub periods: u16,
}

#[event]
pub struct SwapExecuted {
    pub plan: Pubkey,
    pub period: u16,
    pub output_mint: Pubkey,
    pub funding_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct PlanClosed {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub reclaimed_periods: u16,
}

#[error_code]
pub enum KiteGuardError {
    #[msg("Funding amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Total periods must be greater than zero.")]
    InvalidPeriods,
    #[msg("Period interval is too short.")]
    PeriodTooShort,
    #[msg("Outputs must contain between 1 and 20 assets.")]
    InvalidOutputsCount,
    #[msg("Output allocation weights must sum to exactly 10,000 basis points (100%).")]
    InvalidAllocationWeights,
    #[msg("Calculation overflow.")]
    CalculationOverflow,
    #[msg("Allocation weights overflowed u16.")]
    WeightOverflow,
    #[msg("This recurring plan has already completed all scheduled periods.")]
    PlanAlreadyCompleted,
    #[msg("Minimum period interval has not elapsed yet.")]
    PeriodNotElapsed,
    #[msg("The source token mint does not match the plan funding mint.")]
    MismatchedFundingMint,
    #[msg("The guard could not collect enough funding from the subscription.")]
    InsufficientFundingCollected,
    #[msg("The owner's output token balance did not increase after execution.")]
    OutputDidNotIncrease,
}
