use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_lang::solana_program::instruction::{Instruction, AccountMeta};
use crate::constants::*;
use crate::instructions::CreatePlanData;
use crate::error::KiteGuardError;
use crate::state::*;

pub fn due_period(plan: &Plan, now: i64) -> Result<u16> {
    require!(
        now >= plan.starts_at && now < plan.expires_at,
        KiteGuardError::PeriodNotElapsed
    );
    let index = (now - plan.starts_at) / (plan.period_seconds as i64);
    require!(
        index >= 0
            && index < plan.periods as i64
            && plan.executed_periods < plan.periods
            && (plan.last_executed_period == NO_EXECUTED_PERIOD
                || plan.last_executed_period < index as u16),
        KiteGuardError::PeriodNotElapsed
    );
    Ok(index as u16)
}

pub fn validate_terms(data: &CreatePlanData, funding_mint: &Pubkey, now: i64) -> Result<()> {
    require!(
        data.period_seconds >= MIN_PERIOD_SECONDS,
        KiteGuardError::PeriodTooShort
    );
    require!(
        data.starts_at > now && data.periods > 0,
        KiteGuardError::InvalidSchedule
    );
    let duration = (data.periods as u64)
        .checked_mul(data.period_seconds)
        .ok_or(KiteGuardError::InvalidSchedule)?;
    require!(
        duration <= MAX_DURATION_SECONDS
            && data.starts_at >= now
            && data.starts_at.checked_sub(now).is_some_and(|t| t <= 300)
            && data.expires_at == data.starts_at + duration as i64
            && data.funding_amount > 0,
        KiteGuardError::InvalidSchedule
    );
    require!(
        !data.outputs.is_empty() && data.outputs.len() <= MAX_OUTPUT_ASSETS,
        KiteGuardError::InvalidOutput
    );
    let mut total_weight = 0u16;
    let mut unique_mints = Vec::with_capacity(data.outputs.len());
    for output in data.outputs.iter() {
        require!(
            output.weight_bps > 0
                && output.minimum_amount_out > 0
                && output.mint != *funding_mint,
            KiteGuardError::InvalidOutput
        );
        require!(
            !unique_mints.contains(&output.mint),
            KiteGuardError::InvalidOutput
        );
        unique_mints.push(output.mint);
        total_weight = total_weight
            .checked_add(output.weight_bps)
            .ok_or(KiteGuardError::InvalidOutput)?;
    }
    require!(
        total_weight == TOTAL_WEIGHT_BPS,
        KiteGuardError::InvalidOutput
    );
    Ok(())
}

pub fn validate_funding_account(
    account: &AccountInfo,
    owner: &Pubkey,
    mint: &Pubkey,
    check_delegate: bool,
) -> Result<TokenAccount> {
    let token = read_token(account)?;
    require!(
        token.owner == *owner && token.mint == *mint && !token.is_frozen(),
        KiteGuardError::InvalidTokenAccount
    );
    if check_delegate {
        require!(
            token.delegate == COption::None && token.close_authority == COption::None,
            KiteGuardError::FundingDelegateMismatch
        );
    }
    Ok(token)
}

pub fn read_token(account: &AccountInfo) -> Result<TokenAccount> {
    require!(
        account.owner == &Token::id(),
        KiteGuardError::InvalidTokenAccount
    );
    let data = account.try_borrow_data()?;
    let token = TokenAccount::try_deserialize(&mut data.as_ref())?;
    Ok(token)
}

pub fn require_no_freeze_authority(mint_account: &Account<Mint>) -> Result<()> {
    require!(
        mint_account.freeze_authority.is_none(),
        KiteGuardError::UnsupportedFreezeAuthority
    );
    Ok(())
}

pub fn validate_subscription(
    authority: &AccountInfo,
    delegation: &AccountInfo,
    owner: &Pubkey,
    buyer: &Pubkey,
    mint: &Pubkey,
    nonce: u64,
) -> Result<DelegationData> {
    require!(
        authority.owner == &SUBSCRIPTIONS_PROGRAM
            && delegation.owner == &SUBSCRIPTIONS_PROGRAM
            && !authority.data_is_empty()
            && !delegation.data_is_empty(),
        KiteGuardError::InvalidDelegation
    );
    let (expected_authority, _) = Pubkey::find_program_address(
        &[b"authority", owner.as_ref(), mint.as_ref(), &nonce.to_le_bytes()],
        &SUBSCRIPTIONS_PROGRAM,
    );
    require!(
        authority.key() == expected_authority,
        KiteGuardError::InvalidDelegation
    );
    let authority_data = authority.try_borrow_data()?;
    let current_init_id = i64::from_le_bytes(authority_data[41..49].try_into().unwrap());
    
    let delegation_data = delegation.try_borrow_data()?;
    let del_owner = Pubkey::try_from(&delegation_data[9..41]).unwrap();
    let del_buyer = Pubkey::try_from(&delegation_data[41..73]).unwrap();
    let del_mint = Pubkey::try_from(&delegation_data[105..137]).unwrap();
    let init_id = i64::from_le_bytes(delegation_data[137..145].try_into().unwrap());
    
    require!(
        del_owner == *owner
            && del_buyer == *buyer
            && del_mint == *mint
            && init_id == current_init_id,
        KiteGuardError::DelegationTermsMismatch
    );
    Ok(DelegationData {
        owner: del_owner,
        delegatee: del_buyer,
        payer: Pubkey::try_from(&delegation_data[73..105]).unwrap(),
        authority: expected_authority,
        mint: del_mint,
        init_id,
        current_period_start: i64::from_le_bytes(delegation_data[145..153].try_into().unwrap()),
        period_seconds: u64::from_le_bytes(delegation_data[153..161].try_into().unwrap()),
        expires_at: i64::from_le_bytes(delegation_data[161..169].try_into().unwrap()),
        amount: u64::from_le_bytes(delegation_data[169..177].try_into().unwrap()),
        pulled: u64::from_le_bytes(delegation_data[177..185].try_into().unwrap()),
    })
}

pub fn subscriptions_transfer_instruction(
    delegation: Pubkey,
    authority: Pubkey,
    source: Pubkey,
    receiver: Pubkey,
    mint: Pubkey,
    delegatee: Pubkey,
    event_authority: Pubkey,
    owner: Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = vec![5];
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(owner.as_ref());
    data.extend_from_slice(mint.as_ref());
    Instruction {
        program_id: SUBSCRIPTIONS_PROGRAM,
        accounts: vec![
            AccountMeta::new(delegation, false),
            AccountMeta::new_readonly(authority, false),
            AccountMeta::new(source, false),
            AccountMeta::new(receiver, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(Token::id(), false),
            AccountMeta::new_readonly(delegatee, true),
            AccountMeta::new_readonly(event_authority, false),
            AccountMeta::new_readonly(SUBSCRIPTIONS_PROGRAM, false),
        ],
        data,
    }
}
