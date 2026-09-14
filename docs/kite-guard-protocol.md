# Kite Guard: Smart Contract Technical Specification

## 1. Executive Summary

Kite Guard (`kite_guard`) is an Anchor-based smart contract deployed to Solana that provides trustless execution guarantees for non-custodial recurring stock and basket investments.

In traditional automated investing (SIP / DCA) on Solana, users either deposit liquidity into centralized or custodial smart contract vaults (fragmenting liquidity and increasing counterparty risk), or delegate an allowance to an off-chain executor that must be trusted to execute swaps. Kite Guard eliminates this trust boundary by acting as a non-custodial execution guard:
1. The user creates an on-chain recurring plan defining target asset weights, execution interval, and installment count.
2. The user delegates spending permissions to the Kite Guard Program Derived Address (PDA).
3. Any untrusted decentralized keeper or cranker can trigger execution periods.
4. The program enforces strict interval cadence, token matching, and output verification, atomically routing delivered assets directly to the investor's wallet.
5. The investor retains full authority to cancel the plan and reclaim SOL rent at any time.

---

## 2. On-Chain Program Identity

- **Program Name:** `kite_guard`
- **Program ID:** `Fg6PaFpoGXkYidMpWEEe9nM3q7x5JqFHvXy6n3sNof9S`
- **Framework:** Anchor v0.30.1
- **Solana Toolchain:** Agave / Solana CLI 4.0.0, Rust SBF Compiler (rustc 1.89)
- **Deployment Status:** Devnet staged

---

## 3. Account Architecture & PDA Derivation

### 3.1 Plan Account

The recurring plan is stored in a deterministic PDA derived from the investor's wallet address and the funding token mint.

```
PDA Seeds: [b"plan", owner_pubkey.as_ref(), funding_mint_pubkey.as_ref()]
```

### 3.2 Plan Data Layout

| Field | Type | Size (Bytes) | Description |
| :--- | :--- | :--- | :--- |
| `owner` | `Pubkey` | 32 | Authority that initialized the plan and receives reclaimed rent |
| `funding_mint` | `Pubkey` | 32 | SPL / Token-2022 mint used to fund installments (e.g. USDC) |
| `funding_amount` | `u64` | 8 | Quantity of funding tokens allocated per installment period |
| `period_seconds` | `u64` | 8 | Interval duration between executions in seconds |
| `last_executed_at` | `i64` | 8 | Unix timestamp of the most recent execution period |
| `periods` | `u16` | 2 | Total number of planned installments (1 - 365) |
| `executed_periods` | `u16` | 2 | Number of installments successfully processed so far |
| `subscription_authority` | `Pubkey` | 32 | PDA authority validated by the Subscriptions program |
| `bump` | `u8` | 1 | Canonical PDA bump seed |
| `outputs` | `Vec<Output>` | 4 + (N * 34) | List of target token mints and allocation weights (max 20) |

Total allocated account space: 817 bytes + 8 bytes Anchor account discriminator.

### 3.3 Output Asset Struct

```rust
pub struct Output {
    pub mint: Pubkey,       // Target stock/token mint
    pub weight_bps: u16,    // Basis points (e.g., 5000 = 50.00%)
}
```

---

## 4. Instruction Specification

### 4.1 `create_plan`

Initializes a guarded recurring investment schedule for a specific funding token.

- **Signers Required:** `owner`
- **Validations:**
  - `funding_amount > 0`: Prevents zero-value installment plans.
  - `periods > 0`: Requires at least one installment.
  - `period_seconds >= 60`: Enforces minimum time bounds (devnet minimum 60 seconds; production standard 86,400 seconds).
  - `1 <= outputs.len() <= 20`: Bounds array size to prevent compute budget exhaustion.
  - `sum(outputs.weight_bps) == 10,000`: Strictly requires weights to total 100.00%.
  - `each output.weight_bps > 0`: Rejects non-allocating entries.
- **Events Emitted:** `PlanCreated`

### 4.2 `execute_swap`

Permissionless cranker entrypoint. Executes a scheduled installment period.

- **Signers Required:** `cranker` (Any decentralized keeper bot paying transaction fees)
- **Validations:**
  - `plan.executed_periods < plan.periods`: Plan must not be exhausted.
  - `Clock::unix_timestamp >= plan.last_executed_at + plan.period_seconds`: Verifies interval has elapsed.
  - `source_token.mint == plan.funding_mint`: Ensures cranker provides matching funding token accounts.
- **State Changes:**
  - Increments `executed_periods` by 1.
  - Updates `last_executed_at` to the current block timestamp.
- **Events Emitted:** `SwapExecuted`

### 4.3 `close_plan`

Cancels a plan and closes the account, returning all rent exemption lamports to the owner.

- **Signers Required:** `owner`
- **Validations:**
  - `has_one = owner`: Only the creator of the plan can close it.
  - Closes the PDA account and zeroes its data.
- **Events Emitted:** `PlanClosed`

---

## 5. Security Model & Guarantees

1. **Non-Custodial Architecture:**
   - User funds never sit idle in a smart contract pool. Tokens remain in the user's wallet until the exact second an installment execution transaction executes.
2. **Strict Invariant Verification:**
   - Basket weights are strictly enforced to sum to 10,000 basis points upon creation.
   - Installments cannot be executed prematurely; the Solana on-chain Sysvar Clock enforces the minimum period delay.
3. **Guaranteed Rent Reclamation:**
   - Users can revoke permissions and call `close_plan` at any time to recover their rent lamports without administrative lockups.
4. **Isolated Trust Boundary:**
   - The contract architecture isolates off-chain execution risks by enforcing immutable parameters (target mints, weights, and owner destinations) on-chain.

---

## 6. Verification and Testing

### 6.1 Anchor Program Compilation

The program compiles with native Solana SBF toolchain (Rust 1.89 / Agave):

```bash
cd packages/anchor
anchor build
```

Generates:
- SBF executable: `packages/anchor/target/deploy/kite_guard.so`
- Anchor IDL: `packages/anchor/target/idl/kite_guard.json`
- TypeScript definitions: `packages/anchor/target/types/kite_guard.ts`

### 6.2 Mocha Test Suite

Anchor integration tests run with Mocha and Chai:

```bash
pnpm test:anchor
```

Test coverage includes:
- Verification of IDL instruction and account schemas.
- Deterministic PDA address derivation.
- Strict 10,000 basis points weight summation validation.
- Rejection of oversized asset baskets (>20 assets).
- Account layout validation for `create_plan`, `execute_swap`, and `close_plan`.
- Rent reclamation authority checks.

### 6.3 SDK Integration Tests

```bash
pnpm test:sdk
```

Validates the typed client layer, boundary math, and parameter verification across 117 automated unit tests.
