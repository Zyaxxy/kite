use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount};
use crate::constants::*;
use crate::error::KiteGuardError;
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct ExecuteSwap<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    #[account(mut, seeds = [b"plan_v2", plan.owner.as_ref(), plan.funding_mint.as_ref(), &plan.nonce.to_le_bytes()], bump = plan.bump, constraint = plan.version == PROTOCOL_VERSION @ KiteGuardError::UnsupportedPlanVersion)]
    pub plan: Account<'info, Plan>,
    #[account(mut, address = plan.funding_mint)]
    pub funding_mint: Account<'info, Mint>,
    /// CHECK: canonical address and data validated in handler.
    #[account(address = plan.subscription_authority)]
    pub subscription_authority: UncheckedAccount<'info>,
    /// CHECK: canonical address and data validated in handler.
    #[account(mut, address = plan.recurring_delegation)]
    pub recurring_delegation: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner_funding_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub plan_funding_token: Account<'info, TokenAccount>,
    /// CHECK: fixed official executable program.
    #[account(address = SUBSCRIPTIONS_PROGRAM, executable)]
    pub subscriptions_program: UncheckedAccount<'info>,
    /// CHECK: the official subscriptions event-authority PDA.
    #[account(seeds = [b"event_authority"], bump, seeds::program = SUBSCRIPTIONS_PROGRAM)]
    pub event_authority: UncheckedAccount<'info>,
    /// CHECK: canonical mock mint authority for devnet testing.
    #[account(seeds = [MOCK_MINT_AUTHORITY_SEED], bump)]
    pub mock_mint_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct InstallmentExecuted {
    pub plan: Pubkey,
    pub period: u16,
    pub funding_amount: u64,
    pub output_amounts: Vec<u64>,
    pub timestamp: i64,
}

pub fn execute_swap<'info>(
    ctx: Context<'info, ExecuteSwap<'info>>,
    expected_period: u16,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let plan = &ctx.accounts.plan;
    require_no_freeze_authority(&ctx.accounts.funding_mint)?;
    let period = due_period(plan, now)?;
    require!(period == expected_period, KiteGuardError::UnexpectedPeriod);
    let plan_key = plan.key();
    let nonce = plan.nonce.to_le_bytes();
    let bump = [plan.bump];
    let signer: &[&[u8]] = &[
        b"plan_v2",
        plan.owner.as_ref(),
        plan.funding_mint.as_ref(),
        &nonce,
        &bump,
    ];
    let source = validate_funding_account(
        &ctx.accounts.owner_funding_token.to_account_info(),
        &plan.owner,
        &plan.funding_mint,
        false,
    )?;
    let staging = validate_funding_account(
        &ctx.accounts.plan_funding_token.to_account_info(),
        &plan_key,
        &plan.funding_mint,
        true,
    )?;
    require!(
        source.delegate == COption::Some(plan.subscription_authority)
            && source.delegated_amount >= plan.funding_amount,
        KiteGuardError::FundingDelegateMismatch
    );
    let delegation = validate_subscription(
        &ctx.accounts.subscription_authority.to_account_info(),
        &ctx.accounts.recurring_delegation.to_account_info(),
        &plan.owner,
        &plan_key,
        &plan.funding_mint,
        plan.nonce,
    )?;
    require!(
        delegation.init_id == plan.subscription_init_id
            && delegation.period_seconds == plan.period_seconds
            && delegation.amount == plan.funding_amount
            && delegation.expires_at == plan.expires_at,
        KiteGuardError::DelegationTermsMismatch
    );
    require!(
        delegation.current_period_start >= plan.starts_at
            && delegation.current_period_start < plan.expires_at
            && (delegation.current_period_start - plan.starts_at) % plan.period_seconds as i64
                == 0,
        KiteGuardError::DelegationTermsMismatch
    );
    require!(
        ctx.remaining_accounts.len() == plan.outputs.len() * MOCK_ROUTE_ACCOUNTS,
        KiteGuardError::InvalidOutput
    );
    let mut before_outputs: Vec<u64> = Vec::with_capacity(plan.outputs.len());
    for i in 0..plan.outputs.len() {
        let token = read_token(&ctx.remaining_accounts[i * MOCK_ROUTE_ACCOUNTS + 1])?;
        before_outputs.push(token.amount);
    }
    let ix = subscriptions_transfer_instruction(
        ctx.accounts.recurring_delegation.key(),
        ctx.accounts.subscription_authority.key(),
        ctx.accounts.owner_funding_token.key(),
        ctx.accounts.plan_funding_token.key(),
        plan.funding_mint,
        plan_key,
        ctx.accounts.event_authority.key(),
        plan.owner,
        plan.funding_amount,
    );
    invoke_signed(
        &ix,
        &[
            ctx.accounts.recurring_delegation.to_account_info(),
            ctx.accounts.subscription_authority.to_account_info(),
            ctx.accounts.owner_funding_token.to_account_info(),
            ctx.accounts.plan_funding_token.to_account_info(),
            ctx.accounts.funding_mint.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.plan.to_account_info(),
            ctx.accounts.event_authority.to_account_info(),
            ctx.accounts.subscriptions_program.to_account_info(),
        ],
        &[signer],
    )?;
    let source_after = read_token(&ctx.accounts.owner_funding_token.to_account_info())?.amount;
    let collected = read_token(&ctx.accounts.plan_funding_token.to_account_info())?.amount;
    require!(
        source.amount.checked_sub(source_after) == Some(plan.funding_amount)
            && collected.checked_sub(staging.amount) == Some(plan.funding_amount),
        KiteGuardError::FundingBalanceMismatch
    );
    let mut delivered = Vec::with_capacity(plan.outputs.len());
    for (i, output) in plan.outputs.iter().enumerate() {
        let a = &ctx.remaining_accounts[i * MOCK_ROUTE_ACCOUNTS..(i + 1) * MOCK_ROUTE_ACCOUNTS];
        let amount = output.minimum_amount_out.max(1);
        let mint_authority = Mint::try_deserialize(&mut a[0].try_borrow_data()?.as_ref())?;
        require!(mint_authority.mint_authority == COption::Some(ctx.accounts.mock_mint_authority.key()), KiteGuardError::MockMintAuthorityMismatch);
        
        let mock_bump = [ctx.bumps.mock_mint_authority];
        let mock_signer: &[&[u8]] = &[MOCK_MINT_AUTHORITY_SEED, &mock_bump[..]];
        
        let _ = token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: a[0].clone(),
                    to: a[1].clone(),
                    authority: ctx.accounts.mock_mint_authority.to_account_info(),
                },
                &[mock_signer],
            ),
            amount,
        )?;
        let destination = read_token(&a[1])?;
        require!(
            destination.owner == plan.owner && destination.mint == output.mint,
            KiteGuardError::OutputDidNotIncrease
        );
        delivered.push(amount);
    }
    token::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.funding_mint.to_account_info(),
                from: ctx.accounts.plan_funding_token.to_account_info(),
                authority: ctx.accounts.plan.to_account_info(),
            },
            &[signer],
        ),
        plan.funding_amount,
    )?;
    require!(
        read_token(&ctx.accounts.plan_funding_token.to_account_info())?.amount
            == staging.amount,
        KiteGuardError::FundingBalanceMismatch
    );
    for (i, output) in plan.outputs.iter().enumerate() {
        let token = read_token(&ctx.remaining_accounts[i * MOCK_ROUTE_ACCOUNTS + 1])?;
        require!(
            token.owner == plan.owner
                && token.mint == output.mint
                && token.amount.checked_sub(before_outputs[i]) == Some(delivered[i]),
            KiteGuardError::OutputDidNotIncrease
        );
    }
    let plan = &mut ctx.accounts.plan;
    plan.executed_periods = plan
        .executed_periods
        .checked_add(1)
        .ok_or(KiteGuardError::CalculationOverflow)?;
    plan.last_executed_period = period;
    plan.last_executed_at = now;
    emit!(InstallmentExecuted {
        plan: plan_key,
        period,
        funding_amount: plan.funding_amount,
        output_amounts: delivered,
        timestamp: now
    });
    Ok(())
}
