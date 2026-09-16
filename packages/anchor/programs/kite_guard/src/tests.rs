use anchor_lang::prelude::*;
use crate::constants::*;
use crate::instructions::CreatePlanData;
use crate::state::*;
use crate::utils::*;
use crate::ID;

fn output(weight_bps: u16) -> Output {
    Output {
        mint: Pubkey::new_unique(),
        weight_bps,
        minimum_amount_out: 1,
    }
}
fn terms() -> CreatePlanData {
    CreatePlanData {
        nonce: 42,
        funding_amount: 101,
        period_seconds: 60,
        starts_at: 1_000,
        expires_at: 1_180,
        periods: 3,
        devnet_mock: true,
        outputs: vec![output(5000), output(5000)],
    }
}
fn plan() -> Plan {
    Plan {
        version: PROTOCOL_VERSION,
        devnet_mock: true,
        owner: Pubkey::new_unique(),
        funding_mint: Pubkey::new_unique(),
        nonce: 42,
        funding_amount: 101,
        period_seconds: 60,
        starts_at: 1_000,
        expires_at: 1_180,
        periods: 3,
        executed_periods: 0,
        last_executed_period: NO_EXECUTED_PERIOD,
        last_executed_at: 0,
        subscription_authority: Pubkey::new_unique(),
        recurring_delegation: Pubkey::new_unique(),
        subscription_init_id: 15,
        bump: 254,
        outputs: vec![output(5000), output(5000)],
    }
}

#[test]
fn schedule_rejects_wrapping_periods_past_start_unbounded_or_misaligned_expiry() {
    let mint = Pubkey::new_unique();
    assert!(validate_terms(&terms(), &mint, 900).is_ok());
    for period_seconds in [0, 59, i64::MAX as u64 + 1, u64::MAX] {
        let mut t = terms();
        t.period_seconds = period_seconds;
        assert!(validate_terms(&t, &mint, 900).is_err());
    }
    let mut t = terms();
    t.expires_at += 1;
    assert!(validate_terms(&t, &mint, 900).is_err());
    assert!(validate_terms(&terms(), &mint, 1001).is_err());
    t = terms();
    t.periods = 366;
    assert!(validate_terms(&t, &mint, 900).is_err());
}

#[test]
fn zero_funded_legs_and_duplicate_mints_are_rejected() {
    let mint = Pubkey::new_unique();
    let mut t = terms();
    t.outputs[1].mint = t.outputs[0].mint;
    assert!(validate_terms(&t, &mint, 900).is_err());
    t = terms();
    t.outputs[0].minimum_amount_out = 0;
    assert!(validate_terms(&t, &mint, 900).is_err());
    t = terms();
    t.outputs[0].mint = mint;
    assert!(validate_terms(&t, &mint, 900).is_err());
}

#[test]
fn schedule_never_replays_or_backfills_and_stops_at_expiry() {
    let mut p = plan();
    assert!(due_period(&p, 999).is_err());
    assert_eq!(due_period(&p, 1000).unwrap(), 0);
    p.last_executed_period = 0;
    p.executed_periods = 1;
    assert!(due_period(&p, 1059).is_err());
    assert_eq!(due_period(&p, 1060).unwrap(), 1);
    // A late collector runs the latest period only, never an accumulated allowance.
    assert_eq!(due_period(&p, 1179).unwrap(), 2);
    p.last_executed_period = 2;
    p.executed_periods = 2;
    assert!(due_period(&p, 1179).is_err());
    assert!(due_period(&p, 1180).is_err());
}

#[test]
fn plan_serialized_layout_and_maximum_space_match_client_wire_format() {
    let mut p = plan();
    p.outputs = (0..MAX_OUTPUT_ASSETS).map(|_| output(500)).collect();
    let mut bytes = Vec::new();
    p.try_serialize(&mut bytes).unwrap();
    assert_eq!(bytes.len(), 8 + Plan::MAX_SIZE);
    assert_eq!(bytes[8], 2);
    // devnet_mock bool is the first field after version
    assert_eq!(bytes[9] == 1, p.devnet_mock);
}

#[test]
fn subscription_cpi_wire_format_is_official_and_only_plan_pda_signs() {
    let p = plan();
    let owner = p.owner;
    let delegatee = Pubkey::new_unique();
    let ix = subscriptions_transfer_instruction(
        p.recurring_delegation,
        p.subscription_authority,
        Pubkey::new_unique(),
        Pubkey::new_unique(),
        p.funding_mint,
        delegatee,
        Pubkey::new_unique(),
        owner,
        0x0807060504030201,
    );
    assert_eq!(ix.program_id, SUBSCRIPTIONS_PROGRAM);
    assert_eq!(ix.accounts.len(), 9);
    assert_eq!(ix.accounts.iter().filter(|m| m.is_signer).count(), 1);
    assert!(ix.accounts[0].is_writable && ix.accounts[2].is_writable && ix.accounts[3].is_writable);
}

#[test]
fn nonce_creates_independent_pda_grants_for_same_owner_and_funding_mint() {
    let p = plan();
    let first = Pubkey::find_program_address(
        &[
            b"plan_v2",
            p.owner.as_ref(),
            p.funding_mint.as_ref(),
            &42u64.to_le_bytes(),
        ],
        &ID,
    )
    .0;
    let second = Pubkey::find_program_address(
        &[
            b"plan_v2",
            p.owner.as_ref(),
            p.funding_mint.as_ref(),
            &43u64.to_le_bytes(),
        ],
        &ID,
    )
    .0;
    assert_ne!(first, second);
    assert!(!first.is_on_curve());
}

#[test]
fn a_year_of_daily_installments_allows_the_short_review_window() {
    let mut t = terms();
    t.starts_at = 1_020;
    t.period_seconds = 86_400;
    t.periods = 365;
    t.expires_at = t.starts_at + 31_536_000;
    assert!(validate_terms(&t, &Pubkey::new_unique(), 900).is_ok());
    assert!(validate_terms(&t, &Pubkey::new_unique(), 719).is_err());
}
