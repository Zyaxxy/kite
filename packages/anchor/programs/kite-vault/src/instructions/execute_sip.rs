use crate::{
    errors::KiteError,
    state::{SipExecuted, SipPosition},
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

#[derive(Accounts)]
pub struct ExecuteSip<'info> {
    #[account(mut, seeds = [b"sip", sip_position.owner.as_ref(), &sip_position.plan_id.to_le_bytes()], bump = sip_position.bump)]
    pub sip_position: Account<'info, SipPosition>,
    #[account(constraint = executor.key() != sip_position.owner @ KiteError::AccountAlias)]
    pub executor: Signer<'info>,
    #[account(address = sip_position.input_mint)]
    pub input_mint: Account<'info, Mint>,
    #[account(address = sip_position.output_mint,
        constraint = input_mint.key() != output_mint.key() @ KiteError::AccountAlias)]
    pub output_mint: Account<'info, Mint>,
    #[account(mut, address = sip_position.input_account, token::mint = input_mint,
        constraint = input_account.owner == sip_position.owner,
        constraint = input_account.delegate == COption::Some(sip_position.key()) @ KiteError::InvalidDelegate,
        constraint = input_account.delegated_amount >= sip_position.amount_per_cycle @ KiteError::InvalidDelegate)]
    pub input_account: Account<'info, TokenAccount>,
    #[account(mut, address = sip_position.output_account, token::mint = output_mint,
        constraint = output_account.owner == sip_position.owner)]
    pub output_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = input_mint, token::authority = executor)]
    pub executor_input_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = output_mint, token::authority = executor)]
    pub executor_output_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Atomic counterparty settlement, not an arbitrary-CPI Jupiter route executor.
/// The executor supplies inventory, and the owner receives the fixed authorized floor.
pub fn execute_sip_handler(ctx: Context<ExecuteSip>, output_amount: u64) -> Result<()> {
    require!(
        output_amount >= ctx.accounts.sip_position.minimum_output,
        KiteError::MinimumOutput
    );
    let input_before = ctx.accounts.input_account.amount;
    let output_before = ctx.accounts.output_account.amount;
    let sip = &mut ctx.accounts.sip_position;
    sip.record_execution(Clock::get()?.unix_timestamp)?;
    let amount = sip.amount_per_cycle;
    let owner = sip.owner;
    let plan_id = sip.plan_id.to_le_bytes();
    let bump = [sip.bump];
    let seeds: &[&[u8]] = &[b"sip", owner.as_ref(), &plan_id, &bump];
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.executor_output_account.to_account_info(),
                mint: ctx.accounts.output_mint.to_account_info(),
                to: ctx.accounts.output_account.to_account_info(),
                authority: ctx.accounts.executor.to_account_info(),
            },
        ),
        output_amount,
        ctx.accounts.output_mint.decimals,
    )?;
    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.input_account.to_account_info(),
                mint: ctx.accounts.input_mint.to_account_info(),
                to: ctx.accounts.executor_input_account.to_account_info(),
                authority: sip.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.input_mint.decimals,
    )?;
    ctx.accounts.input_account.reload()?;
    ctx.accounts.output_account.reload()?;
    let received = ctx
        .accounts
        .output_account
        .amount
        .checked_sub(output_before)
        .ok_or(KiteError::MathOverflow)?;
    let spent = input_before
        .checked_sub(ctx.accounts.input_account.amount)
        .ok_or(KiteError::MathOverflow)?;
    require!(received >= sip.minimum_output, KiteError::MinimumOutput);
    require!(spent == amount, KiteError::InputMismatch);
    emit!(SipExecuted {
        plan: sip.key(),
        executor: ctx.accounts.executor.key(),
        cycle: sip.cycles_executed,
        input_amount: amount,
        output_amount: received
    });
    Ok(())
}
