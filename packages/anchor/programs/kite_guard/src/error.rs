use anchor_lang::prelude::*;

#[error_code]
pub enum KiteGuardError {
    #[msg("Devnet mock mint authority does not match the program PDA.")]
    MockMintAuthorityMismatch,
    #[msg("Period interval must be at least 60 seconds.")]
    PeriodTooShort,
    #[msg("Calculation overflow.")]
    CalculationOverflow,
    #[msg("This period is not due or was already executed.")]
    PeriodNotElapsed,
    #[msg("Owner output delivery was not verified.")]
    OutputDidNotIncrease,
    #[msg("Unsupported plan version.")]
    UnsupportedPlanVersion,
    #[msg("The schedule must be bounded, aligned, and end within one year.")]
    InvalidSchedule,
    #[msg("Outputs require distinct mints and positive minimum deliveries.")]
    InvalidOutput,
    #[msg("A canonical unfrozen token account is required.")]
    InvalidTokenAccount,
    #[msg("Invalid official recurring delegation or authority.")]
    InvalidDelegation,
    #[msg("The delegation does not match the owner-approved plan terms.")]
    DelegationTermsMismatch,
    #[msg("The funding account no longer delegates to Subscriptions.")]
    FundingDelegateMismatch,
    #[msg("The requested period does not match the current schedule window.")]
    UnexpectedPeriod,
    #[msg("Funding balance changes do not match the approved allocation.")]
    FundingBalanceMismatch,
    #[msg("Recurring funding and output mints must have no freeze authority.")]
    UnsupportedFreezeAuthority,
}
