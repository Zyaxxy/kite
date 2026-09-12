use anchor_lang::prelude::*;
use crate::state::SipPosition;

#[derive(Accounts)]
pub struct CancelSip<'info> {
    #[account(
        mut,
        close = owner,
        seeds = [b"sip_position", owner.key().as_ref(), sip_position.target_basket.as_ref()],
        bump = sip_position.bump,
        has_one = owner
    )]
    pub sip_position: Account<'info, SipPosition>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn cancel_sip_handler(ctx: Context<CancelSip>) -> Result<()> {
    msg!("Kite SIP position cancelled and closed");
    Ok(())
}
