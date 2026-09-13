use crate::{
    errors::KiteError,
    state::{SipPosition, SipTerms},
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, ApproveChecked, Mint, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(plan_id: u64)]
pub struct CreateSip<'info> {
    #[account(init, payer = owner, space = SipPosition::LEN,
        seeds = [b"sip", owner.key().as_ref(), &plan_id.to_le_bytes()], bump)]
    pub sip_position: Account<'info, SipPosition>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub input_mint: Account<'info, Mint>,
    #[account(constraint = input_mint.key() != output_mint.key() @ KiteError::AccountAlias)]
    pub output_mint: Account<'info, Mint>,
    #[account(mut, token::mint = input_mint, token::authority = owner,
        constraint = input_account.delegate == COption::None @ KiteError::ExistingDelegate)]
    pub input_account: Account<'info, TokenAccount>,
    #[account(token::mint = output_mint, token::authority = owner)]
    pub output_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_sip_handler(ctx: Context<CreateSip>, plan_id: u64, terms: SipTerms) -> Result<()> {
    let allowance = terms.validate(Clock::get()?.unix_timestamp)?;
    let sip = &mut ctx.accounts.sip_position;
    sip.set_inner(SipPosition {
        owner: ctx.accounts.owner.key(),
        input_mint: ctx.accounts.input_mint.key(),
        output_mint: ctx.accounts.output_mint.key(),
        input_account: ctx.accounts.input_account.key(),
        output_account: ctx.accounts.output_account.key(),
        plan_id,
        amount_per_cycle: terms.amount_per_cycle,
        minimum_output: terms.minimum_output,
        interval_seconds: terms.interval_seconds,
        next_execution_at: terms.first_execution_at,
        expires_at: terms.expires_at,
        max_cycles: terms.max_cycles,
        cycles_executed: 0,
        is_active: true,
        bump: ctx.bumps.sip_position,
    });
    token::approve_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            ApproveChecked {
                to: ctx.accounts.input_account.to_account_info(),
                mint: ctx.accounts.input_mint.to_account_info(),
                delegate: sip.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        allowance,
        ctx.accounts.input_mint.decimals,
    )
}
