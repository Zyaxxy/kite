use crate::state::SipPosition;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, Revoke, Token, TokenAccount};

#[derive(Accounts)]
pub struct CancelSip<'info> {
    #[account(mut, seeds = [b"sip", owner.key().as_ref(), &sip_position.plan_id.to_le_bytes()],
        bump = sip_position.bump, has_one = owner)]
    pub sip_position: Account<'info, SipPosition>,
    pub owner: Signer<'info>,
    #[account(mut, address = sip_position.input_account, token::authority = owner,
        constraint = input_account.mint == sip_position.input_mint)]
    pub input_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn cancel_sip_handler(ctx: Context<CancelSip>) -> Result<()> {
    ctx.accounts.sip_position.is_active = false;
    // Do not revoke an unrelated allowance the owner may have replaced this plan with.
    if ctx.accounts.input_account.delegate == COption::Some(ctx.accounts.sip_position.key()) {
        token::revoke(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Revoke {
                source: ctx.accounts.input_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ))?;
    }
    // Retain the small state account as a tombstone; old plan IDs cannot be reinitialized.
    Ok(())
}
