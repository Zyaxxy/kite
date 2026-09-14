use super::*;

fn output(weight_bps: u16) -> OutputV2 {
    OutputV2 {
        mint: Pubkey::new_unique(),
        weight_bps,
        pool: Pubkey::new_unique(),
        minimum_amount_out: 1,
    }
}
fn terms() -> CreatePlanV2Data {
    CreatePlanV2Data {
        nonce: 42,
        funding_amount: 101,
        period_seconds: 60,
        starts_at: 1_000,
        expires_at: 1_180,
        periods: 3,
        outputs: vec![output(5000), output(5000)],
    }
}
fn plan() -> PlanV2 {
    PlanV2 {
        version: PROTOCOL_VERSION,
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
fn basket_allocations_conserve_every_unit_and_ties_use_plan_order() {
    let outputs = vec![output(3334), output(3333), output(3333)];
    assert_eq!(allocate_funding(10, &outputs).unwrap(), vec![4, 3, 3]);
    assert_eq!(
        allocate_funding(101, &[output(5000), output(5000)]).unwrap(),
        vec![51, 50]
    );
    assert_eq!(
        allocate_funding(u64::MAX, &outputs)
            .unwrap()
            .iter()
            .map(|v| u128::from(*v))
            .sum::<u128>(),
        u128::from(u64::MAX)
    );
    for amount in 3..10_000 {
        assert_eq!(
            allocate_funding(amount, &outputs)
                .unwrap()
                .iter()
                .sum::<u64>(),
            amount
        );
    }
}

#[test]
fn zero_funded_legs_invalid_weights_duplicates_and_dust_are_rejected() {
    assert!(allocate_funding(1, &[output(5000), output(5000)]).is_err());
    assert!(allocate_funding(100, &[output(9999)]).is_err());
    assert!(allocate_funding(100, &[output(10_000), output(0)]).is_err());
    let mint = Pubkey::new_unique();
    let mut t = terms();
    t.outputs[1].mint = t.outputs[0].mint;
    assert!(validate_terms(&t, &mint, 900).is_err());
    t = terms();
    t.outputs[1].pool = t.outputs[0].pool;
    assert!(validate_terms(&t, &mint, 900).is_err());
    t = terms();
    t.outputs[0].minimum_amount_out = 0;
    assert!(validate_terms(&t, &mint, 900).is_err());
    t = terms();
    t.outputs[0].mint = mint;
    assert!(validate_terms(&t, &mint, 900).is_err());
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
    assert_eq!(bytes.len(), 8 + PlanV2::MAX_SIZE);
    assert_eq!(bytes[8], 2);
    assert_eq!(
        u32::from_le_bytes(bytes[200..204].try_into().unwrap()),
        MAX_OUTPUT_ASSETS as u32
    );
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
    assert_eq!(ix.data.len(), 73);
    assert_eq!(&ix.data[..9], &[5, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert_eq!(&ix.data[9..41], owner.as_ref());
    assert_eq!(&ix.data[41..73], p.funding_mint.as_ref());
    assert_eq!(ix.accounts.len(), 9);
    assert_eq!(ix.accounts[6], AccountMeta::new_readonly(delegatee, true));
    assert_eq!(ix.accounts.iter().filter(|m| m.is_signer).count(), 1);
    assert!(ix.accounts[0].is_writable && ix.accounts[2].is_writable && ix.accounts[3].is_writable);
}

fn delegation_bytes(p: &PlanV2, delegatee: &Pubkey, authority: &Pubkey) -> Vec<u8> {
    let mut bytes = vec![0; 211];
    bytes[0] = 3;
    bytes[1] = 1;
    bytes[3..35].copy_from_slice(p.owner.as_ref());
    bytes[35..67].copy_from_slice(delegatee.as_ref());
    bytes[67..99].copy_from_slice(p.owner.as_ref());
    bytes[99..107].copy_from_slice(&p.subscription_init_id.to_le_bytes());
    bytes[107..139].copy_from_slice(authority.as_ref());
    bytes[139..171].copy_from_slice(p.funding_mint.as_ref());
    bytes[171..179].copy_from_slice(&p.starts_at.to_le_bytes());
    bytes[179..187].copy_from_slice(&p.period_seconds.to_le_bytes());
    bytes[187..195].copy_from_slice(&p.expires_at.to_le_bytes());
    bytes[195..203].copy_from_slice(&p.funding_amount.to_le_bytes());
    bytes
}

#[test]
fn official_delegation_decoder_fails_closed_for_wrong_type_version_or_size() {
    let p = plan();
    let delegatee = Pubkey::new_unique();
    let bytes = delegation_bytes(&p, &delegatee, &p.subscription_authority);
    let decoded = decode_delegation(&bytes).unwrap();
    assert_eq!(decoded.owner, p.owner);
    assert_eq!(decoded.delegatee, delegatee);
    assert_eq!(decoded.amount, p.funding_amount);
    assert_eq!(decoded.period_seconds, 60);
    for size in [0, 1, 107, 210, 212] {
        let mut changed = bytes.clone();
        changed.resize(size, 0);
        assert!(decode_delegation(&changed).is_err());
    }
    for (index, value) in [(0, 2), (1, 0), (1, 2)] {
        let mut changed = bytes.clone();
        changed[index] = value;
        assert!(decode_delegation(&changed).is_err());
    }
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
