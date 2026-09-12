use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};
use crate::state::BasketVault;
use crate::errors::KiteError;

#[derive(Accounts)]
pub struct DepositBasket<'info> {
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

pub fn deposit_basket_handler(
    ctx: Context<DepositBasket>,
    usdc_amount_in: u64,
    min_basket_tokens_out: u64,
) -> Result<()> {
    require!(usdc_amount_in > 0, KiteError::MathOverflow);
    let vault = &mut ctx.accounts.basket_vault;

    let fee = (usdc_amount_in as u128 * vault.fee_basis_points as u128 / 10000) as u64;
    let net_amount = usdc_amount_in - fee;
    let tokens_to_mint = net_amount; // 1:1 normalized basis for demo

    require!(tokens_to_mint >= min_basket_tokens_out, KiteError::MathOverflow);

    let seeds = &[
        b"basket_vault",
        vault.basket_mint.as_ref(),
        &[vault.bump],
    ];
    let signer = &[&seeds[..]];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.basket_mint.to_account_info(),
                to: ctx.accounts.user_basket_account.to_account_info(),
                authority: vault.to_account_info(),
            },
            signer,
        ),
        tokens_to_mint,
    )?;

    vault.total_minted = vault.total_minted.checked_add(tokens_to_mint).ok_or(KiteError::MathOverflow)?;

    msg!("Minted {} basket tokens for {} USDC", tokens_to_mint, usdc_amount_in);
    Ok(())
}
