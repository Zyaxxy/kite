use crate::errors::KiteError;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct SipTerms {
    pub amount_per_cycle: u64,
    pub minimum_output: u64,
    pub interval_seconds: u64,
    pub first_execution_at: i64,
    pub expires_at: i64,
    pub max_cycles: u32,
}

impl SipTerms {
    pub fn validate(&self, now: i64) -> Result<u64> {
        require!(
            self.amount_per_cycle > 0 && self.minimum_output > 0,
            KiteError::InvalidTerms
        );
        require!(
            self.interval_seconds >= 60 && self.interval_seconds <= 31_536_000,
            KiteError::InvalidTerms
        );
        require!(self.max_cycles > 0, KiteError::InvalidTerms);
        require!(
            self.first_execution_at >= now && self.expires_at > self.first_execution_at,
            KiteError::InvalidTerms
        );
        self.first_execution_at
            .checked_add(self.interval_seconds as i64)
            .ok_or(KiteError::MathOverflow)?;
        self.amount_per_cycle
            .checked_mul(u64::from(self.max_cycles))
            .ok_or_else(|| error!(KiteError::MathOverflow))
    }
}

#[account]
pub struct SipPosition {
    pub owner: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub input_account: Pubkey,
    pub output_account: Pubkey,
    pub plan_id: u64,
    pub amount_per_cycle: u64,
    pub minimum_output: u64,
    pub interval_seconds: u64,
    pub next_execution_at: i64,
    pub expires_at: i64,
    pub max_cycles: u32,
    pub cycles_executed: u32,
    pub is_active: bool,
    pub bump: u8,
}

impl SipPosition {
    pub const LEN: usize = 8 + 32 * 5 + 8 * 6 + 4 * 2 + 1 + 1;

    pub fn record_execution(&mut self, now: i64) -> Result<()> {
        require!(
            self.is_active && self.cycles_executed < self.max_cycles,
            KiteError::SipInactive
        );
        require!(now < self.expires_at, KiteError::Expired);
        require!(now >= self.next_execution_at, KiteError::IntervalNotElapsed);
        // Schedule from actual execution: a delayed crank cannot drain missed cycles in a burst.
        let next = now
            .checked_add(i64::try_from(self.interval_seconds).map_err(|_| KiteError::MathOverflow)?)
            .ok_or(KiteError::MathOverflow)?;
        self.cycles_executed = self
            .cycles_executed
            .checked_add(1)
            .ok_or(KiteError::MathOverflow)?;
        self.next_execution_at = next;
        self.is_active = self.cycles_executed < self.max_cycles && next < self.expires_at;
        Ok(())
    }
}

#[event]
pub struct SipExecuted {
    pub plan: Pubkey,
    pub executor: Pubkey,
    pub cycle: u32,
    pub input_amount: u64,
    pub output_amount: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn terms() -> SipTerms {
        SipTerms {
            amount_per_cycle: 10,
            minimum_output: 1,
            interval_seconds: 60,
            first_execution_at: 100,
            expires_at: 1_000,
            max_cycles: 2,
        }
    }
    fn plan() -> SipPosition {
        SipPosition {
            owner: Pubkey::default(),
            input_mint: Pubkey::default(),
            output_mint: Pubkey::default(),
            input_account: Pubkey::default(),
            output_account: Pubkey::default(),
            plan_id: 1,
            amount_per_cycle: 10,
            minimum_output: 1,
            interval_seconds: 60,
            next_execution_at: 100,
            expires_at: 1_000,
            max_cycles: 2,
            cycles_executed: 0,
            is_active: true,
            bump: 1,
        }
    }
    #[test]
    fn allowance_is_finite_and_checked() {
        assert_eq!(terms().validate(100).unwrap(), 20);
        let mut t = terms();
        t.amount_per_cycle = u64::MAX;
        assert!(t.validate(100).is_err());
        t = terms();
        t.max_cycles = 0;
        assert!(t.validate(100).is_err());
        t = terms();
        t.minimum_output = 0;
        assert!(t.validate(100).is_err());
        t = terms();
        t.interval_seconds = u64::MAX;
        assert!(t.validate(100).is_err());
    }
    #[test]
    fn schedule_rejects_early_expired_and_inactive_cycles() {
        let mut p = plan();
        assert!(p.record_execution(99).is_err());
        assert!(p.record_execution(1_000).is_err());
        p.is_active = false;
        assert!(p.record_execution(100).is_err());
    }
    #[test]
    fn overdue_cycles_cannot_burst_and_cap_cannot_be_exceeded() {
        let mut p = plan();
        p.record_execution(500).unwrap();
        assert_eq!(p.next_execution_at, 560);
        assert!(p.record_execution(500).is_err());
        p.record_execution(560).unwrap();
        assert!(!p.is_active);
        assert!(p.record_execution(620).is_err());
    }
    #[test]
    fn timestamp_overflow_does_not_increment_cycle() {
        let mut p = plan();
        p.expires_at = i64::MAX;
        assert!(p.record_execution(i64::MAX - 1).is_err());
        assert_eq!(p.cycles_executed, 0);
    }
}
