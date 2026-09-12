use anchor_lang::prelude::*;
use crate::state::SipPosition;
use crate::errors::KiteError;

#[derive(Accounts)]
pub struct ExecuteSip<'info> {
    #[account(
        mut,
        seeds = [b"sip_position", sip_position.owner.as_ref(), sip_position.target_basket.as_ref()],
        bump = sip_position.bump
    )]
    pub sip_position: Account<'info, SipPosition>,

    pub caller: Signer<'info>,
}

pub fn execute_sip_handler(ctx: Context<ExecuteSip>) -> Result<()> {
    let sip = &mut ctx.accounts.sip_position;
    require!(sip.is_active, KiteError::SipInactive);

    let current_time = Clock::get()?.unix_timestamp;
    let time_since_last = current_time - sip.last_executed_timestamp;

    require!(time_since_last >= sip.interval_seconds as i64, KiteError::IntervalNotElapsed);

    sip.last_executed_timestamp = current_time;
    sip.total_cycles_executed = sip.total_cycles_executed.checked_add(1).ok_or(KiteError::MathOverflow)?;

    msg!("Kite SIP cycle #{} executed successfully", sip.total_cycles_executed);
    Ok(())
}
