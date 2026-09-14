use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
    program_option::COption,
};
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs");

pub const PROTOCOL_VERSION: u8 = 2;
pub const TOTAL_WEIGHT_BPS: u16 = 10_000;
pub const MAX_OUTPUT_ASSETS: usize = 20;
pub const MIN_PERIOD_SECONDS: u64 = 60;
pub const MAX_DURATION_SECONDS: u64 = 31_536_000;
pub const NO_EXECUTED_PERIOD: u16 = u16::MAX;
pub const SUBSCRIPTIONS_PROGRAM: Pubkey = pubkey!("De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44");
// Deliberately the official DEVNET CPMM program. There is no caller-selected router.
pub const RAYDIUM_PROGRAM: Pubkey = pubkey!("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb");
pub const ASSOCIATED_TOKEN_PROGRAM: Pubkey =
    pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const RAYDIUM_AUTHORITY_SEED: &[u8] = b"vault_and_lp_mint_auth_seed";
pub const ROUTE_ACCOUNTS: usize = 7;
const RAYDIUM_SWAP_DISCRIMINATOR: [u8; 8] = [143, 190, 90, 218, 196, 30, 51, 222];
const POOL_DISCRIMINATOR: [u8; 8] = [247, 237, 227, 245, 215, 195, 222, 70];
const CONFIG_DISCRIMINATOR: [u8; 8] = [218, 244, 33, 104, 203, 203, 43, 111];
const OBSERVATION_DISCRIMINATOR: [u8; 8] = [122, 174, 197, 53, 129, 9, 165, 132];

#[program]
pub mod kite_guard {
    use super::*;

    /// Read-only release capability probe. No legacy counter-only execution is supported.
    pub fn protocol_version(_ctx: Context<ProtocolVersion>) -> Result<u8> {
        Ok(PROTOCOL_VERSION)
    }

    /// Legacy instruction retained only to reject stale clients explicitly.
    pub fn create_plan(_ctx: Context<CreatePlan>, _data: CreatePlanData) -> Result<()> {
        err!(KiteGuardError::LegacyPlanDisabled)
    }

    /// Legacy execution never advances counters or emits a successful investment.
    pub fn execute_swap(_ctx: Context<ExecuteSwap>, _plan_id: u64) -> Result<()> {
        err!(KiteGuardError::LegacyPlanDisabled)
    }

    /// The legacy owner can still recover rent from an old scaffold plan.
    pub fn close_plan(_ctx: Context<ClosePlan>) -> Result<()> {
        Ok(())
    }

    /// Owner approves exact devnet pools, minimum deliveries, and a bounded delegation.
    /// Canonical ATAs and the official delegation must be created earlier in this transaction.
    pub fn create_plan_v2(ctx: Context<CreatePlanV2>, data: CreatePlanV2Data) -> Result<()> {
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
        validate_routes(
            ctx.remaining_accounts,
            &data.outputs,
            &ctx.accounts.owner.key(),
            &ctx.accounts.funding_mint.key(),
            false,
        )?;
        let plan = &mut ctx.accounts.plan;
        plan.version = PROTOCOL_VERSION;
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
        emit!(PlanCreatedV2 {
            plan: plan_key,
            owner: plan.owner,
            nonce: plan.nonce,
            starts_at: plan.starts_at,
            expires_at: plan.expires_at
        });
        Ok(())
    }

    /// One atomic installment: bounded Subscriptions collection, every approved CPMM leg,
    /// then verified owner deliveries. Any error rolls back both programs and all counters.
    pub fn execute_swap_v2<'info>(
        ctx: Context<'info, ExecuteSwapV2<'info>>,
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
        // A re-created delegation cannot change the approved schedule or replay an earlier window.
        require!(
            delegation.current_period_start >= plan.starts_at
                && delegation.current_period_start < plan.expires_at
                && (delegation.current_period_start - plan.starts_at) % plan.period_seconds as i64
                    == 0,
            KiteGuardError::DelegationTermsMismatch
        );
        validate_routes(
            ctx.remaining_accounts,
            &plan.outputs,
            &plan.owner,
            &plan.funding_mint,
            true,
        )?;
        let allocations = allocate_funding(plan.funding_amount, &plan.outputs)?;
        let before_outputs = plan
            .outputs
            .iter()
            .enumerate()
            .map(|(i, _)| {
                read_token(&ctx.remaining_accounts[i * ROUTE_ACCOUNTS + 1]).map(|t| t.amount)
            })
            .collect::<Result<Vec<_>>>()?;
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
            let a = &ctx.remaining_accounts[i * ROUTE_ACCOUNTS..(i + 1) * ROUTE_ACCOUNTS];
            let before = read_token(&ctx.accounts.plan_funding_token.to_account_info())?.amount;
            let swap = raydium_swap_instruction(
                plan_key,
                ctx.accounts.raydium_authority.key(),
                ctx.accounts.plan_funding_token.key(),
                plan.funding_mint,
                a,
                allocations[i],
                output.minimum_amount_out,
            );
            invoke_signed(
                &swap,
                &[
                    ctx.accounts.plan.to_account_info(),
                    ctx.accounts.raydium_authority.to_account_info(),
                    a[3].clone(),
                    a[2].clone(),
                    ctx.accounts.plan_funding_token.to_account_info(),
                    a[1].clone(),
                    a[4].clone(),
                    a[5].clone(),
                    ctx.accounts.token_program.to_account_info(),
                    ctx.accounts.funding_mint.to_account_info(),
                    a[0].clone(),
                    a[6].clone(),
                    ctx.accounts.raydium_program.to_account_info(),
                ],
                &[signer],
            )?;
            let after = read_token(&ctx.accounts.plan_funding_token.to_account_info())?.amount;
            let amount = read_token(&a[1])?
                .amount
                .checked_sub(before_outputs[i])
                .ok_or(KiteGuardError::OutputDidNotIncrease)?;
            require!(
                before.checked_sub(after) == Some(allocations[i]),
                KiteGuardError::FundingBalanceMismatch
            );
            require!(
                amount >= output.minimum_amount_out,
                KiteGuardError::MinimumOutputNotMet
            );
            delivered.push(amount);
        }
        require!(
            read_token(&ctx.accounts.plan_funding_token.to_account_info())?.amount
                == staging.amount,
            KiteGuardError::FundingBalanceMismatch
        );
        // Recheck every destination after the final CPI, not just immediately after its own leg.
        for (i, output) in plan.outputs.iter().enumerate() {
            let token = read_token(&ctx.remaining_accounts[i * ROUTE_ACCOUNTS + 1])?;
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

    /// Owner-only cancellation revokes the bound grant before closing plan accounts.
    /// Already-revoked grants remain cancellable; incidental staging donations go to owner.
    pub fn close_plan_v2(ctx: Context<ClosePlanV2>) -> Result<()> {
        let plan = &ctx.accounts.plan;
        let plan_key = plan.key();
        validate_funding_account_state(
            &ctx.accounts.owner_funding_token.to_account_info(),
            &plan.owner,
            &plan.funding_mint,
            false,
            true,
        )?;
        let staging = validate_funding_account_state(
            &ctx.accounts.plan_funding_token.to_account_info(),
            &plan_key,
            &plan.funding_mint,
            true,
            true,
        )?;
        let delegation_info = ctx.accounts.recurring_delegation.to_account_info();
        if delegation_info.owner == &SUBSCRIPTIONS_PROGRAM {
            let delegation = decode_delegation(&delegation_info.try_borrow_data()?)?;
            require!(
                delegation.owner == plan.owner
                    && delegation.delegatee == plan_key
                    && delegation.mint == plan.funding_mint,
                KiteGuardError::InvalidDelegation
            );
            require_keys_eq!(
                delegation.payer,
                ctx.accounts.delegation_rent_payer.key(),
                KiteGuardError::InvalidRentRecipient
            );
            let ix = Instruction {
                program_id: SUBSCRIPTIONS_PROGRAM,
                accounts: vec![
                    AccountMeta::new(plan.owner, true),
                    AccountMeta::new(plan.recurring_delegation, false),
                    AccountMeta::new(delegation.payer, false),
                ],
                data: vec![3],
            };
            invoke(
                &ix,
                &[
                    ctx.accounts.owner.to_account_info(),
                    delegation_info,
                    ctx.accounts.delegation_rent_payer.to_account_info(),
                    ctx.accounts.subscriptions_program.to_account_info(),
                ],
            )?;
        } else {
            require!(
                delegation_info.owner == &System::id() && delegation_info.data_is_empty(),
                KiteGuardError::InvalidDelegation
            );
        }
        let nonce = plan.nonce.to_le_bytes();
        let bump = [plan.bump];
        let signer: &[&[u8]] = &[
            b"plan_v2",
            plan.owner.as_ref(),
            plan.funding_mint.as_ref(),
            &nonce,
            &bump,
        ];
        if staging.amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.plan_funding_token.to_account_info(),
                        to: ctx.accounts.owner_funding_token.to_account_info(),
                        authority: ctx.accounts.plan.to_account_info(),
                    },
                    &[signer],
                ),
                staging.amount,
            )?;
        }
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.plan_funding_token.to_account_info(),
                destination: ctx.accounts.owner.to_account_info(),
                authority: ctx.accounts.plan.to_account_info(),
            },
            &[signer],
        ))?;
        emit!(PlanClosedV2 {
            plan: plan_key,
            owner: plan.owner
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ProtocolVersion {}

#[derive(Accounts)]
#[instruction(data: CreatePlanV2Data)]
pub struct CreatePlanV2<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub funding_mint: Account<'info, Mint>,
    /// CHECK: owner, discriminator, canonical PDA and identity validated in handler.
    pub subscription_authority: UncheckedAccount<'info>,
    /// CHECK: exact canonical official delegation and approved terms validated in handler.
    pub recurring_delegation: UncheckedAccount<'info>,
    #[account(init, payer = owner, space = 8 + PlanV2::MAX_SIZE, seeds = [b"plan_v2", owner.key().as_ref(), funding_mint.key().as_ref(), &data.nonce.to_le_bytes()], bump)]
    pub plan: Account<'info, PlanV2>,
    #[account(mut)]
    pub plan_funding_token: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExecuteSwapV2<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    #[account(mut, seeds = [b"plan_v2", plan.owner.as_ref(), plan.funding_mint.as_ref(), &plan.nonce.to_le_bytes()], bump = plan.bump, constraint = plan.version == PROTOCOL_VERSION @ KiteGuardError::UnsupportedPlanVersion)]
    pub plan: Account<'info, PlanV2>,
    #[account(address = plan.funding_mint)]
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
    /// CHECK: fixed devnet Raydium CPMM executable program.
    #[account(address = RAYDIUM_PROGRAM, executable)]
    pub raydium_program: UncheckedAccount<'info>,
    /// CHECK: canonical Raydium vault authority, never an arbitrary swapper wallet.
    #[account(seeds = [RAYDIUM_AUTHORITY_SEED], bump, seeds::program = RAYDIUM_PROGRAM)]
    pub raydium_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClosePlanV2<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"plan_v2", owner.key().as_ref(), plan.funding_mint.as_ref(), &plan.nonce.to_le_bytes()], bump = plan.bump, has_one = owner, close = owner)]
    pub plan: Account<'info, PlanV2>,
    #[account(address = plan.funding_mint)]
    pub funding_mint: Account<'info, Mint>,
    #[account(mut)]
    pub owner_funding_token: Account<'info, TokenAccount>,
    /// CHECK: classic SPL canonical plan ATA validated before transfers and close CPI.
    #[account(mut)]
    pub plan_funding_token: UncheckedAccount<'info>,
    /// CHECK: exact bound delegation; handler supports externally revoked accounts.
    #[account(mut, address = plan.recurring_delegation)]
    pub recurring_delegation: UncheckedAccount<'info>,
    /// CHECK: must equal the official delegation's recorded payer while it exists.
    #[account(mut)]
    pub delegation_rent_payer: UncheckedAccount<'info>,
    /// CHECK: fixed official executable program.
    #[account(address = SUBSCRIPTIONS_PROGRAM, executable)]
    pub subscriptions_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreatePlanV2Data {
    pub nonce: u64,
    pub funding_amount: u64,
    pub period_seconds: u64,
    pub starts_at: i64,
    pub expires_at: i64,
    pub periods: u16,
    pub outputs: Vec<OutputV2>,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct OutputV2 {
    pub mint: Pubkey,
    pub weight_bps: u16,
    pub pool: Pubkey,
    pub minimum_amount_out: u64,
}
#[account]
pub struct PlanV2 {
    pub version: u8,
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
    pub outputs: Vec<OutputV2>,
}
impl PlanV2 {
    pub const MAX_SIZE: usize = 196 + MAX_OUTPUT_ASSETS * 74;
}

pub fn validate_terms(data: &CreatePlanV2Data, funding_mint: &Pubkey, now: i64) -> Result<()> {
    require!(data.funding_amount > 0, KiteGuardError::InvalidAmount);
    require!(
        data.periods > 0 && data.periods <= 365,
        KiteGuardError::InvalidPeriods
    );
    require!(
        data.period_seconds >= MIN_PERIOD_SECONDS && data.period_seconds <= MAX_DURATION_SECONDS,
        KiteGuardError::PeriodTooShort
    );
    let duration = data
        .period_seconds
        .checked_mul(u64::from(data.periods))
        .ok_or(KiteGuardError::CalculationOverflow)?;
    require!(
        duration <= MAX_DURATION_SECONDS && data.starts_at >= now && data.starts_at >= 0,
        KiteGuardError::InvalidSchedule
    );
    require!(
        data.starts_at.checked_add(duration as i64) == Some(data.expires_at)
            && data.starts_at.checked_sub(now).is_some_and(|t| t <= 300),
        KiteGuardError::InvalidSchedule
    );
    require!(
        !data.outputs.is_empty() && data.outputs.len() <= MAX_OUTPUT_ASSETS,
        KiteGuardError::InvalidOutputsCount
    );
    let mut weight = 0u32;
    for (i, o) in data.outputs.iter().enumerate() {
        require!(
            o.weight_bps > 0
                && o.minimum_amount_out > 0
                && o.mint != *funding_mint
                && o.mint != Pubkey::default()
                && o.pool != Pubkey::default(),
            KiteGuardError::InvalidOutput
        );
        require!(
            !data.outputs[..i]
                .iter()
                .any(|p| p.mint == o.mint || p.pool == o.pool),
            KiteGuardError::DuplicateOutput
        );
        weight = weight
            .checked_add(u32::from(o.weight_bps))
            .ok_or(KiteGuardError::WeightOverflow)?;
    }
    require!(
        weight == u32::from(TOTAL_WEIGHT_BPS),
        KiteGuardError::InvalidAllocationWeights
    );
    allocate_funding(data.funding_amount, &data.outputs)?;
    Ok(())
}

/// Hare-Niemeyer allocation with stable plan-order tie breaking and zero dust.
pub fn allocate_funding(amount: u64, outputs: &[OutputV2]) -> Result<Vec<u64>> {
    require!(
        amount > 0 && !outputs.is_empty() && outputs.len() <= MAX_OUTPUT_ASSETS,
        KiteGuardError::InvalidAmount
    );
    require!(
        outputs.iter().map(|o| u32::from(o.weight_bps)).sum::<u32>() == u32::from(TOTAL_WEIGHT_BPS)
            && outputs.iter().all(|o| o.weight_bps > 0),
        KiteGuardError::InvalidAllocationWeights
    );
    let parts: Vec<(u64, u128)> = outputs
        .iter()
        .map(|o| {
            let product = u128::from(amount) * u128::from(o.weight_bps);
            (
                (product / u128::from(TOTAL_WEIGHT_BPS)) as u64,
                product % u128::from(TOTAL_WEIGHT_BPS),
            )
        })
        .collect();
    let mut allocated: Vec<u64> = parts.iter().map(|p| p.0).collect();
    let mut ranked: Vec<usize> = (0..outputs.len()).collect();
    ranked.sort_by(|a, b| parts[*b].1.cmp(&parts[*a].1).then(a.cmp(b)));
    let remainder = amount
        .checked_sub(allocated.iter().sum())
        .ok_or(KiteGuardError::CalculationOverflow)? as usize;
    require!(
        remainder < outputs.len(),
        KiteGuardError::CalculationOverflow
    );
    for i in ranked.into_iter().take(remainder) {
        allocated[i] += 1;
    }
    require!(
        allocated.iter().all(|a| *a > 0),
        KiteGuardError::InvalidAmount
    );
    Ok(allocated)
}

pub fn due_period(plan: &PlanV2, now: i64) -> Result<u16> {
    require!(
        plan.version == PROTOCOL_VERSION,
        KiteGuardError::UnsupportedPlanVersion
    );
    require!(
        plan.period_seconds >= MIN_PERIOD_SECONDS && plan.period_seconds <= MAX_DURATION_SECONDS,
        KiteGuardError::InvalidSchedule
    );
    require!(now >= plan.starts_at, KiteGuardError::PeriodNotElapsed);
    require!(
        now < plan.expires_at && plan.executed_periods < plan.periods,
        KiteGuardError::PlanAlreadyCompleted
    );
    let period = u16::try_from((now - plan.starts_at) as u64 / plan.period_seconds)
        .map_err(|_| KiteGuardError::CalculationOverflow)?;
    require!(
        period < plan.periods
            && (plan.last_executed_period == NO_EXECUTED_PERIOD
                || period > plan.last_executed_period),
        KiteGuardError::PeriodNotElapsed
    );
    Ok(period)
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), Token::id().as_ref(), mint.as_ref()],
        &ASSOCIATED_TOKEN_PROGRAM,
    )
    .0
}
fn require_no_freeze_authority(mint: &Mint) -> Result<()> {
    require!(
        mint.freeze_authority == COption::None,
        KiteGuardError::UnsupportedFreezeAuthority
    );
    Ok(())
}
fn read_token(info: &AccountInfo) -> Result<TokenAccount> {
    read_token_state(info, false)
}
fn read_token_state(info: &AccountInfo, allow_frozen: bool) -> Result<TokenAccount> {
    require_keys_eq!(
        *info.owner,
        Token::id(),
        KiteGuardError::UnsupportedTokenProgram
    );
    let data = info.try_borrow_data()?;
    require!(data.len() == 165, KiteGuardError::InvalidTokenAccount);
    let token = TokenAccount::try_deserialize(&mut data.as_ref())?;
    require!(
        (allow_frozen || !token.is_frozen()) && token.is_native == COption::None,
        KiteGuardError::InvalidTokenAccount
    );
    Ok(token)
}
fn validate_funding_account(
    info: &AccountInfo,
    owner: &Pubkey,
    mint: &Pubkey,
    staging: bool,
) -> Result<TokenAccount> {
    validate_funding_account_state(info, owner, mint, staging, false)
}
fn validate_funding_account_state(
    info: &AccountInfo,
    owner: &Pubkey,
    mint: &Pubkey,
    staging: bool,
    allow_frozen: bool,
) -> Result<TokenAccount> {
    let token = read_token_state(info, allow_frozen)?;
    require!(
        token.owner == *owner && token.mint == *mint && info.key() == ata(owner, mint),
        KiteGuardError::InvalidTokenAccount
    );
    if staging {
        require!(
            token.delegate == COption::None && token.close_authority == COption::None,
            KiteGuardError::InvalidTokenAccount
        );
    }
    Ok(token)
}
fn read_pubkey(data: &[u8], offset: usize) -> Result<Pubkey> {
    let bytes: [u8; 32] = data
        .get(offset..offset + 32)
        .ok_or(KiteGuardError::InvalidAccountData)?
        .try_into()
        .map_err(|_| KiteGuardError::InvalidAccountData)?;
    Ok(Pubkey::new_from_array(bytes))
}
fn read_u64(data: &[u8], offset: usize) -> Result<u64> {
    Ok(u64::from_le_bytes(
        data.get(offset..offset + 8)
            .ok_or(KiteGuardError::InvalidAccountData)?
            .try_into()
            .map_err(|_| KiteGuardError::InvalidAccountData)?,
    ))
}
fn read_i64(data: &[u8], offset: usize) -> Result<i64> {
    Ok(i64::from_le_bytes(
        data.get(offset..offset + 8)
            .ok_or(KiteGuardError::InvalidAccountData)?
            .try_into()
            .map_err(|_| KiteGuardError::InvalidAccountData)?,
    ))
}
#[derive(Debug)]
struct DelegationData {
    owner: Pubkey,
    delegatee: Pubkey,
    payer: Pubkey,
    authority: Pubkey,
    mint: Pubkey,
    init_id: i64,
    current_period_start: i64,
    period_seconds: u64,
    expires_at: i64,
    amount: u64,
    pulled: u64,
}
fn decode_delegation(data: &[u8]) -> Result<DelegationData> {
    require!(
        data.len() == 211 && data[0] == 3 && data[1] == 1,
        KiteGuardError::InvalidDelegation
    );
    Ok(DelegationData {
        owner: read_pubkey(data, 3)?,
        delegatee: read_pubkey(data, 35)?,
        payer: read_pubkey(data, 67)?,
        init_id: read_i64(data, 99)?,
        authority: read_pubkey(data, 107)?,
        mint: read_pubkey(data, 139)?,
        current_period_start: read_i64(data, 171)?,
        period_seconds: read_u64(data, 179)?,
        expires_at: read_i64(data, 187)?,
        amount: read_u64(data, 195)?,
        pulled: read_u64(data, 203)?,
    })
}
fn validate_subscription(
    authority: &AccountInfo,
    delegation: &AccountInfo,
    owner: &Pubkey,
    plan: &Pubkey,
    mint: &Pubkey,
    nonce: u64,
) -> Result<DelegationData> {
    require!(
        *authority.owner == SUBSCRIPTIONS_PROGRAM && *delegation.owner == SUBSCRIPTIONS_PROGRAM,
        KiteGuardError::InvalidDelegation
    );
    let expected_authority = Pubkey::find_program_address(
        &[b"SubscriptionAuthority", owner.as_ref(), mint.as_ref()],
        &SUBSCRIPTIONS_PROGRAM,
    )
    .0;
    require_keys_eq!(
        authority.key(),
        expected_authority,
        KiteGuardError::InvalidDelegation
    );
    let expected_delegation = Pubkey::find_program_address(
        &[
            b"delegation",
            authority.key.as_ref(),
            owner.as_ref(),
            plan.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &SUBSCRIPTIONS_PROGRAM,
    )
    .0;
    require_keys_eq!(
        delegation.key(),
        expected_delegation,
        KiteGuardError::InvalidDelegation
    );
    let authority_data = authority.try_borrow_data()?;
    require!(
        authority_data.len() == 106
            && authority_data[0] == 0
            && read_pubkey(&authority_data, 1)? == *owner
            && read_pubkey(&authority_data, 33)? == *mint,
        KiteGuardError::InvalidDelegation
    );
    let result = decode_delegation(&delegation.try_borrow_data()?)?;
    require!(
        result.owner == *owner
            && result.delegatee == *plan
            && result.mint == *mint
            && result.authority == authority.key()
            && result.init_id == read_i64(&authority_data, 98)?,
        KiteGuardError::InvalidDelegation
    );
    Ok(result)
}

// Account prefixes pinned to official raydium-cp-swap PoolState (637 bytes).
// The CPI separately verifies Raydium's full config, oracle, reserves and invariant.
fn validate_routes(
    accounts: &[AccountInfo],
    outputs: &[OutputV2],
    owner: &Pubkey,
    funding_mint: &Pubkey,
    writable: bool,
) -> Result<()> {
    require!(
        accounts.len() == outputs.len() * ROUTE_ACCOUNTS,
        KiteGuardError::InvalidRouteAccounts
    );
    let authority = Pubkey::find_program_address(&[RAYDIUM_AUTHORITY_SEED], &RAYDIUM_PROGRAM).0;
    for (i, output) in outputs.iter().enumerate() {
        let a = &accounts[i * ROUTE_ACCOUNTS..(i + 1) * ROUTE_ACCOUNTS];
        require!(
            a[0].key() == output.mint && *a[0].owner == Token::id(),
            KiteGuardError::UnsupportedTokenProgram
        );
        let mint_data = a[0].try_borrow_data()?;
        require!(
            mint_data.len() == 82,
            KiteGuardError::UnsupportedTokenProgram
        );
        let mint = Mint::try_deserialize(&mut mint_data.as_ref())?;
        require_no_freeze_authority(&mint)?;
        let destination = validate_funding_account(&a[1], owner, &output.mint, false)?;
        require!(
            destination.mint == output.mint
                && a[2].key() == output.pool
                && *a[2].owner == RAYDIUM_PROGRAM,
            KiteGuardError::InvalidPool
        );
        if writable {
            require!(
                [1, 2, 4, 5, 6].iter().all(|j| a[*j].is_writable),
                KiteGuardError::InvalidRouteAccounts
            );
        }
        let pool = a[2].try_borrow_data()?;
        require!(
            pool.len() == 637 && pool[..8] == POOL_DISCRIMINATOR && pool[390] == 0,
            KiteGuardError::InvalidPool
        );
        let mint0 = read_pubkey(&pool, 168)?;
        let mint1 = read_pubkey(&pool, 200)?;
        let (input_vault, output_vault) = if mint0 == *funding_mint && mint1 == output.mint {
            (read_pubkey(&pool, 72)?, read_pubkey(&pool, 104)?)
        } else if mint1 == *funding_mint && mint0 == output.mint {
            (read_pubkey(&pool, 104)?, read_pubkey(&pool, 72)?)
        } else {
            return err!(KiteGuardError::InvalidPool);
        };
        require!(
            read_pubkey(&pool, 232)? == Token::id()
                && read_pubkey(&pool, 264)? == Token::id()
                && read_pubkey(&pool, 8)? == a[3].key()
                && read_pubkey(&pool, 296)? == a[6].key()
                && input_vault == a[4].key()
                && output_vault == a[5].key(),
            KiteGuardError::InvalidPool
        );
        require!(
            *a[3].owner == RAYDIUM_PROGRAM && *a[6].owner == RAYDIUM_PROGRAM,
            KiteGuardError::InvalidPool
        );
        let config = a[3].try_borrow_data()?;
        let observation = a[6].try_borrow_data()?;
        require!(
            config.len() >= 8
                && config[..8] == CONFIG_DISCRIMINATOR
                && observation.len() >= 8
                && observation[..8] == OBSERVATION_DISCRIMINATOR,
            KiteGuardError::InvalidPool
        );
        let input = read_token(&a[4])?;
        let out = read_token(&a[5])?;
        require!(
            input.owner == authority
                && out.owner == authority
                && input.mint == *funding_mint
                && out.mint == output.mint,
            KiteGuardError::InvalidPool
        );
    }
    Ok(())
}
fn subscriptions_transfer_instruction(
    delegation: Pubkey,
    authority: Pubkey,
    source: Pubkey,
    receiver: Pubkey,
    mint: Pubkey,
    delegatee: Pubkey,
    event_authority: Pubkey,
    owner: Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = vec![5];
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(owner.as_ref());
    data.extend_from_slice(mint.as_ref());
    Instruction {
        program_id: SUBSCRIPTIONS_PROGRAM,
        accounts: vec![
            AccountMeta::new(delegation, false),
            AccountMeta::new_readonly(authority, false),
            AccountMeta::new(source, false),
            AccountMeta::new(receiver, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(Token::id(), false),
            AccountMeta::new_readonly(delegatee, true),
            AccountMeta::new_readonly(event_authority, false),
            AccountMeta::new_readonly(SUBSCRIPTIONS_PROGRAM, false),
        ],
        data,
    }
}
fn raydium_swap_instruction(
    plan: Pubkey,
    authority: Pubkey,
    source: Pubkey,
    mint: Pubkey,
    a: &[AccountInfo],
    amount: u64,
    minimum: u64,
) -> Instruction {
    let mut data = RAYDIUM_SWAP_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&minimum.to_le_bytes());
    Instruction {
        program_id: RAYDIUM_PROGRAM,
        accounts: vec![
            AccountMeta::new_readonly(plan, true),
            AccountMeta::new_readonly(authority, false),
            AccountMeta::new_readonly(a[3].key(), false),
            AccountMeta::new(a[2].key(), false),
            AccountMeta::new(source, false),
            AccountMeta::new(a[1].key(), false),
            AccountMeta::new(a[4].key(), false),
            AccountMeta::new(a[5].key(), false),
            AccountMeta::new_readonly(Token::id(), false),
            AccountMeta::new_readonly(Token::id(), false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(a[0].key(), false),
            AccountMeta::new(a[6].key(), false),
        ],
        data,
    }
}

// Legacy account layout and close authority are intentionally retained for rent recovery.
#[derive(Accounts)]
pub struct CreatePlan<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub funding_mint: Account<'info, Mint>,
    /// CHECK: deprecated instruction always rejects.
    pub subscription_authority: UncheckedAccount<'info>,
    #[account(init, payer = owner, space = 8 + Plan::MAX_SIZE, seeds = [b"plan", owner.key().as_ref(), funding_mint.key().as_ref()], bump)]
    pub plan: Account<'info, Plan>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ExecuteSwap<'info> {
    #[account(mut)]
    pub cranker: Signer<'info>,
    #[account(mut, seeds = [b"plan", plan.owner.as_ref(), plan.funding_mint.as_ref()], bump = plan.bump)]
    pub plan: Account<'info, Plan>,
    /// CHECK: deprecated instruction always rejects.
    pub subscription_program: UncheckedAccount<'info>,
    /// CHECK: deprecated instruction always rejects.
    pub subscription_authority: UncheckedAccount<'info>,
    /// CHECK: deprecated instruction always rejects.
    pub recurring_delegation: UncheckedAccount<'info>,
    #[account(mut)]
    pub source_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_funding_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner_output_token: Account<'info, TokenAccount>,
    pub output_mint: Account<'info, Mint>,
    /// CHECK: deprecated instruction always rejects.
    pub subscription_instruction: UncheckedAccount<'info>,
}
#[derive(Accounts)]
pub struct ClosePlan<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"plan", owner.key().as_ref(), plan.funding_mint.as_ref()], bump = plan.bump, has_one = owner, close = owner)]
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
    pub const MAX_SIZE: usize = 137 + MAX_OUTPUT_ASSETS * 34;
}

#[event]
pub struct PlanCreatedV2 {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub nonce: u64,
    pub starts_at: i64,
    pub expires_at: i64,
}
#[event]
pub struct InstallmentExecuted {
    pub plan: Pubkey,
    pub period: u16,
    pub funding_amount: u64,
    pub output_amounts: Vec<u64>,
    pub timestamp: i64,
}
#[event]
pub struct PlanClosedV2 {
    pub plan: Pubkey,
    pub owner: Pubkey,
}

#[error_code]
pub enum KiteGuardError {
    #[msg("Funding amount must be greater than zero and fund every basket leg.")]
    InvalidAmount,
    #[msg("Choose between 1 and 365 periods.")]
    InvalidPeriods,
    #[msg("Period interval must be between 60 seconds and one year.")]
    PeriodTooShort,
    #[msg("Outputs must contain between 1 and 20 assets.")]
    InvalidOutputsCount,
    #[msg("Output weights must sum to 10,000 basis points.")]
    InvalidAllocationWeights,
    #[msg("Calculation overflow.")]
    CalculationOverflow,
    #[msg("Allocation weights overflowed.")]
    WeightOverflow,
    #[msg("This plan is completed or expired.")]
    PlanAlreadyCompleted,
    #[msg("This period is not due or was already executed.")]
    PeriodNotElapsed,
    #[msg("The funding mint does not match.")]
    MismatchedFundingMint,
    #[msg("The subscription did not collect the full installment.")]
    InsufficientFundingCollected,
    #[msg("Owner output delivery was not verified.")]
    OutputDidNotIncrease,
    #[msg("Legacy counter-only plans are disabled; create a version 2 plan.")]
    LegacyPlanDisabled,
    #[msg("Unsupported plan version.")]
    UnsupportedPlanVersion,
    #[msg("The schedule must be bounded, aligned, and end within one year.")]
    InvalidSchedule,
    #[msg("Outputs require distinct mints, pools, and positive minimum deliveries.")]
    InvalidOutput,
    #[msg("Duplicate output mint or pool.")]
    DuplicateOutput,
    #[msg("Only classic SPL tokens are supported on devnet.")]
    UnsupportedTokenProgram,
    #[msg("A canonical unfrozen token account is required.")]
    InvalidTokenAccount,
    #[msg("Invalid account data.")]
    InvalidAccountData,
    #[msg("Invalid official recurring delegation or authority.")]
    InvalidDelegation,
    #[msg("The delegation does not match the owner-approved plan terms.")]
    DelegationTermsMismatch,
    #[msg("The funding account no longer delegates to Subscriptions.")]
    FundingDelegateMismatch,
    #[msg("The requested period does not match the current schedule window.")]
    UnexpectedPeriod,
    #[msg("Funding balance changes do not match the approved allocation.")]
    FundingBalanceMismatch,
    #[msg("A basket leg did not deliver the approved minimum.")]
    MinimumOutputNotMet,
    #[msg("Provide exactly the approved route accounts for every output.")]
    InvalidRouteAccounts,
    #[msg("The pool, mints, vaults or oracle do not match the approved devnet route.")]
    InvalidPool,
    #[msg("Delegation rent must return to its original payer.")]
    InvalidRentRecipient,
    #[msg("Recurring funding and output mints must have no freeze authority.")]
    UnsupportedFreezeAuthority,
}

#[cfg(test)]
mod tests;
