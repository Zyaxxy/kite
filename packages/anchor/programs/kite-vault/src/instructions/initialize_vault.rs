use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use crate::state::BasketVault;

#[derive(Accounts)]
#[instruction(name: String, symbol: String)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = BasketVault::LEN,
        seeds = [b"basket_vault", basket_mint.key().as_ref()],
        bump
    )]
    pub basket_vault: Account<'info, BasketVault>,

    pub basket_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn initialize_vault_handler(
    ctx: Context<InitializeVault>,
    name: String,
    symbol: String,
    fee_basis_points: u16,
    asset_count: u8,
) -> Result<()> {
    let vault = &mut ctx.accounts.basket_vault;
    vault.authority = ctx.accounts.authority.key();
    vault.basket_mint = ctx.accounts.basket_mint.key();
    vault.name = name;
    vault.symbol = symbol;
    vault.fee_basis_points = fee_basis_points;
    vault.total_minted = 0;
    vault.asset_count = asset_count;
    vault.bump = ctx.bumps.basket_vault;

    msg!("Kite Basket Vault initialized for {}", vault.symbol);
    Ok(())
}
