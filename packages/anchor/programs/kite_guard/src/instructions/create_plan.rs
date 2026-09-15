use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::constants::*;
use crate::error::KiteGuardError;
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
#[instruction(data: CreatePlanData)]
pub struct CreatePlan<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub funding_mint: Account<'info, Mint>,
    /// CHECK: owner, discriminator, canonical PDA and identity validated in handler.
    pub subscription_authority: UncheckedAccount<'info>,
    /// CHECK: exact canonical official delegation and approved terms validated in handler.
    pub recurring_delegation: UncheckedAccount<'info>,
    #[account(init, payer = owner, space = 8 + Plan::MAX_SIZE, seeds = [b"plan_v2", owner.key().as_ref(), funding_mint.key().as_ref(), &data.nonce.to_le_bytes()], bump)]
    pub plan: Account<'info, Plan>,
    #[account(mut)]
    pub plan_funding_token: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreatePlanData {
    pub nonce: u64,
    pub funding_amount: u64,
    pub period_seconds: u64,
    pub starts_at: i64,
    pub expires_at: i64,
    pub periods: u16,
    pub devnet_mock: bool,
    pub outputs: Vec<Output>,
}

#[event]
pub struct PlanCreated {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub nonce: u64,
    pub starts_at: i64,
    pub expires_at: i64,
}

pub fn create_plan(ctx: Context<CreatePlan>, data: CreatePlanData) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    validate_terms(&data, &ctx.accounts.funding_mint.key(), now)?;
    require_no_freeze_authority(&ctx.accounts.funding_mint)?;
    let plan_key = ctx.accounts.plan.key();
    validate_funding_account(
        &ctx.accounts.plan_funding_token.to_account_info(),
        &plan_key,
        &ctx.accounts.funding_mint.key(),
        true,
    )?;
    let delegation = validate_subscription(
        &ctx.accounts.subscription_authority.to_account_info(),
        &ctx.accounts.recurring_delegation.to_account_info(),
        &ctx.accounts.owner.key(),
        &plan_key,
        &ctx.accounts.funding_mint.key(),
        data.nonce,
    )?;
    require!(
        delegation.period_seconds == data.period_seconds
            && delegation.amount == data.funding_amount
            && delegation.expires_at == data.expires_at
            && delegation.current_period_start == data.starts_at
            && delegation.pulled == 0,
        KiteGuardError::DelegationTermsMismatch
    );
    let plan = &mut ctx.accounts.plan;
    plan.version = PROTOCOL_VERSION;
    plan.devnet_mock = data.devnet_mock;
    plan.owner = ctx.accounts.owner.key();
    plan.funding_mint = ctx.accounts.funding_mint.key();
    plan.nonce = data.nonce;
    plan.funding_amount = data.funding_amount;
    plan.period_seconds = data.period_seconds;
    plan.starts_at = data.starts_at;
    plan.expires_at = data.expires_at;
    plan.periods = data.periods;
    plan.executed_periods = 0;
    plan.last_executed_period = NO_EXECUTED_PERIOD;
    plan.last_executed_at = 0;
    plan.subscription_authority = ctx.accounts.subscription_authority.key();
    plan.recurring_delegation = ctx.accounts.recurring_delegation.key();
    plan.subscription_init_id = delegation.init_id;
    plan.bump = ctx.bumps.plan;
    plan.outputs = data.outputs;
    emit!(PlanCreated {
        plan: plan_key,
        owner: plan.owner,
        nonce: plan.nonce,
        starts_at: plan.starts_at,
        expires_at: plan.expires_at
    });
    Ok(())
}
