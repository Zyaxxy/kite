use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};
use crate::state::BasketVault;
use crate::errors::KiteError;

#[derive(Accounts)]
pub struct RedeemBasket<'info> {
    #[account(
        mut,
        seeds = [b"basket_vault", basket_mint.key().as_ref()],
        bump = basket_vault.bump
    )]
    pub basket_vault: Account<'info, BasketVault>,

    #[account(mut)]
    pub basket_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = user_basket_account.mint == basket_mint.key(),
        constraint = user_basket_account.owner == user.key()
    )]
    pub user_basket_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn redeem_basket_handler(
    ctx: Context<RedeemBasket>,
    basket_tokens_to_burn: u64,
) -> Result<()> {
    require!(basket_tokens_to_burn > 0, KiteError::MathOverflow);
    let vault = &mut ctx.accounts.basket_vault;

    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.basket_mint.to_account_info(),
                from: ctx.accounts.user_basket_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        basket_tokens_to_burn,
    )?;

    vault.total_minted = vault.total_minted.checked_sub(basket_tokens_to_burn).ok_or(KiteError::MathOverflow)?;

    msg!("Burned {} basket tokens for redemption", basket_tokens_to_burn);
    Ok(())
}
