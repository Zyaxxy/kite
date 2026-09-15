use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Transfer, Token, TokenAccount, Mint};
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct ClosePlan<'info> {
    #[account(mut, seeds = [b"plan_v2", plan.owner.as_ref(), plan.funding_mint.as_ref(), &plan.nonce.to_le_bytes()], bump = plan.bump, close = rent_payer)]
    pub plan: Account<'info, Plan>,
    #[account(address = plan.funding_mint)]
    pub funding_mint: Account<'info, Mint>,
    #[account(mut, address = plan.owner)]
    pub owner: Signer<'info>,
    /// CHECK: receives rent.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner_funding_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub plan_funding_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct PlanClosed {
    pub plan: Pubkey,
    pub timestamp: i64,
}

pub fn close_plan(ctx: Context<ClosePlan>) -> Result<()> {
    require_no_freeze_authority(&ctx.accounts.funding_mint)?;
    let plan = &ctx.accounts.plan;
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
    let staging = validate_funding_account(
        &ctx.accounts.plan_funding_token.to_account_info(),
        &plan_key,
        &plan.funding_mint,
        true,
    )?;
    if staging.amount > 0 {
        let _ = validate_funding_account(
            &ctx.accounts.owner_funding_token.to_account_info(),
            &plan.owner,
            &plan.funding_mint,
            false,
        )?;
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
    let now = Clock::get()?.unix_timestamp;
    emit!(PlanClosed {
        plan: plan_key,
        timestamp: now,
    });
    Ok(())
}
