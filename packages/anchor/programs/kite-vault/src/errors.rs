use anchor_lang::prelude::*;

#[error_code]
pub enum KiteError {
    #[msg("Calculation overflow occurred")]
    MathOverflow,
    #[msg("Invalid amount, cycle count, or schedule")]
    InvalidTerms,
    #[msg("SIP is inactive or all authorized cycles have executed")]
    SipInactive,
    #[msg("The next installment is not due")]
    IntervalNotElapsed,
    #[msg("The owner's authorization has expired")]
    Expired,
    #[msg("Input account is already delegated; revoke the existing allowance first")]
    ExistingDelegate,
    #[msg("The plan does not hold the required token allowance")]
    InvalidDelegate,
    #[msg("Input and output accounts and mints must be distinct")]
    AccountAlias,
    #[msg("The recipient did not receive the owner's minimum amount")]
    MinimumOutput,
    #[msg("The owner input balance did not decrease by the authorized installment")]
    InputMismatch,
}
