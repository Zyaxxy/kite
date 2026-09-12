use anchor_lang::prelude::*;
use crate::state::SipPosition;
use crate::errors::KiteError;

#[derive(Accounts)]
#[instruction(amount_per_cycle: u64, interval_seconds: u64)]
pub struct CreateSip<'info> {
    #[account(
        init,
        payer = user,
        space = SipPosition::LEN,
        seeds = [b"sip_position", user.key().as_ref(), target_basket.key().as_ref()],
        bump
    )]
    pub sip_position: Account<'info, SipPosition>,

    /// CHECK: Target basket mint or stock mint account
    pub target_basket: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_sip_handler(
    ctx: Context<CreateSip>,
    amount_per_cycle: u64,
    interval_seconds: u64,
) -> Result<()> {
    require!(amount_per_cycle > 0, KiteError::MathOverflow);
    require!(interval_seconds >= 60, KiteError::MathOverflow); // minimum 1 minute interval

    let sip = &mut ctx.accounts.sip_position;
    sip.owner = ctx.accounts.user.key();
    sip.target_basket = ctx.accounts.target_basket.key();
    sip.amount_per_cycle = amount_per_cycle;
    sip.interval_seconds = interval_seconds;
    sip.last_executed_timestamp = Clock::get()?.unix_timestamp;
    sip.total_cycles_executed = 0;
    sip.is_active = true;
    sip.bump = ctx.bumps.sip_position;

    msg!("Kite SIP position created: {} per {}s into {}", amount_per_cycle, interval_seconds, sip.target_basket);
    Ok(())
}
