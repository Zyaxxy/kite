use anchor_lang::prelude::*;

#[error_code]
pub enum KiteError {
    #[msg("Calculation overflow occurred")]
    MathOverflow,
    #[msg("Invalid asset weights supplied for the basket")]
    InvalidWeights,
    #[msg("SIP position is currently inactive")]
    SipInactive,
    #[msg("SIP execution interval has not elapsed yet")]
    IntervalNotElapsed,
    #[msg("Unauthorized action")]
    Unauthorized,
}
