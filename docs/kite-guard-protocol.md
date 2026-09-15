# Kite Guard Protocol: Devnet Recurring Stocks and Baskets

The **Kite Guard** program (`8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs`) is an on-chain execution guard for trustless recurring investments (SIP / DCA) on Solana. It enables non-custodial scheduled purchases of tokenized equity baskets and individual stocks directly into the user's wallet without holding user funds in any Kite vault.

---

## Architecture Overview

On Devnet, real Token-2022 xStocks and PreStocks do not exist. To provide an authentic, dependable, and verifiable recurring investment demonstration for the Solana Foundation Hackathon:

1. **Permissioned Collection via Official Solana Subscriptions**: The user establishes a revocable, bounded recurring delegation on-chain using the official Solana Subscriptions program (`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`).
2. **Atomic Execution via Kite Guard**: Anyone (or Kite's collector bot) can invoke `execute_swap` on a due installment by paying the small Solana transaction fee. The caller has no spending authority.
3. **Mock Equity Distribution via Program Mint Authority**: The Guard atomically deducts mock KUSD via Subscriptions CPI and mints proportional mock xStock tokens directly into the investor's Associated Token Accounts (ATAs) using its canonical `mock_mint_authority` PDA (`GCT4iZ7JQdW5mHg3Cr1xM75Tsmv1mFnxNTVokRidzmPP`).
4. **Clean Exit**: The investor can close their plan at any time via `close_plan`, reclaiming all account rent and returning any staged tokens.

---

## On-Chain Programs and Identifiers

| Component | Address / Identifier | Description |
|---|---|---|
| **Kite Guard Program** | `8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs` | Anchor 1.2 program managing plans and execution |
| **Mock Mint Authority PDA** | `GCT4iZ7JQdW5mHg3Cr1xM75Tsmv1mFnxNTVokRidzmPP` | PDA derived with seeds `[b"mock_mint_authority"]` |
| **Solana Subscriptions** | `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` | Official Foundation recurring delegation program |
| **Devnet Genesis Hash** | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` | Verified on API preflight to ensure devnet-only execution |

---

## Instructions & Anchor Structure

The smart contract is structured into standard modular instructions in `packages/anchor/programs/kite_guard/src/instructions/`:

### 1. `create_plan`
- **Discriminator**: `[77, 43, 141, 254, 212, 118, 41, 186]`
- **Accounts**:
  - `owner` (Signer, Writable)
  - `funding_mint` (Mint)
  - `subscription_authority` (Unchecked, validated on-chain)
  - `recurring_delegation` (Unchecked, validated on-chain)
  - `plan` (Init PDA: `[b"plan_v2", owner, funding_mint, nonce_le]`)
  - `plan_funding_token` (Writable ATA for plan staging)
  - `system_program`
  - `token_program`
- **Invariants Enforced**:
  - Minimum period length: 60 seconds.
  - Duration: 1 to 365 periods, bounded within 1 year maximum.
  - Start review window: Starts within 300 seconds of current chain time.
  - Output allocations: 1 to 20 assets, weights strictly sum to 10,000 basis points (100%), no duplicate mints, no funding mint in outputs.
  - No freeze authority allowed on funding or output mints.

### 2. `execute_swap`
- **Discriminator**: `[56, 182, 124, 215, 155, 140, 157, 102]`
- **Parameters**: `expected_period: u16`
- **Behavior**:
  - Verifies the installment is currently due and has not been executed previously.
  - CPIs into Solana Subscriptions (`transfer_recurring_delegation`) using the `plan` PDA signer.
  - Calculates proportional output allocations using BigInt arithmetic with the Largest Remainder Method (Hare-Niemeyer).
  - In Devnet Mock mode: Signs via `mock_mint_authority` PDA and CPIs into SPL Token `mint_to` directly into the owner's ATAs.
  - Updates plan execution counters (`executed_periods`, `last_executed_period`, `last_executed_at`).
  - Verifies that the plan staging ATA is fully emptied, ensuring zero dust leakage or trapped funds.

### 3. `close_plan`
- **Discriminator**: `[45, 137, 184, 220, 162, 253, 161, 8]`
- **Accounts**:
  - `plan` (PDA, closed to `rent_payer`)
  - `funding_mint`
  - `owner` (Signer)
  - `rent_payer` (Receives recovered account rent)
  - `owner_funding_token` (Receives any remaining staging funds)
  - `plan_funding_token` (Closed to `owner`)
  - `token_program`
- **Behavior**:
  - Sweeps any residual staging funds back to the owner's ATA.
  - Closes the plan account and returns rent lamports to the payer.

---

## Account Storage & Binary Layout

`Plan` account sizing:
- **Header**: 8-byte Anchor discriminator + 197 bytes metadata = 205 bytes.
- **Outputs**: 4-byte count prefix + up to 20 outputs @ 42 bytes each (`mint: Pubkey` 32B, `weight_bps: u16` 2B, `minimum_amount_out: u64` 8B) = 844 bytes.
- **Total Allocated Size**: **1,045 bytes** (`8 + Plan::MAX_SIZE`).
- **Owner Query Offset**: Byte 10 (discriminator: 8, `version`: 1, `devnet_mock`: 1, `owner`: offset 10..42).

```
+------------------+---------+-------------+---------------------+-------------------+
| Discriminator 8B | Ver 1B  | Mock 1B     | Owner 32B (byte 10) | Funding Mint 32B  |
+------------------+---------+-------------+---------------------+-------------------+
| Nonce 8B         | Amount  | Period 8B   | StartsAt 8B         | ExpiresAt 8B      |
+------------------+---------+-------------+---------------------+-------------------+
| Periods 2B       | Exec 2B | LastExec 2B | LastAt 8B           | Authority 32B     |
+------------------+---------+-------------+---------------------+-------------------+
| Delegation 32B   | Init 8B | Bump 1B     | Count 4B            | Outputs (N x 42B) |
+------------------+---------+-------------+---------------------+-------------------+
```

---

## API Endpoints (`apps/web/app/api/recurring`)

| Route | Method | Description |
|---|---|---|
| `/api/recurring/config` | GET | Returns devnet recurring readiness, funding token, and available stocks/baskets |
| `/api/recurring?wallet=<pubkey>` | GET | Lists all active on-chain plans for the specified wallet using `getProgramAccounts` |
| `/api/recurring` | POST | Composes unsigned V1 transaction for plan setup (ATAs, Subscriptions delegation, `create_plan`) |
| `/api/recurring/collect` | POST | Composes unsigned V1 transaction for due installment execution for a fee payer |
| `/api/recurring/revoke` | POST | Composes unsigned V1 transaction to close the plan and reclaim rent |
| `/api/recurring/execute` | POST | Verifies HMAC review token and wallet Ed25519 signature before broadcasting to devnet RPC |

---

## Verification & Test Suite

Run the full verification suite across smart contract, SDK, and web applications:

```bash
# 1. Anchor smart contract unit tests (7 passing)
cargo test --manifest-path packages/anchor/Cargo.toml -p kite_guard

# 2. SDK build and unit tests (146 passing)
pnpm build:sdk
node --test packages/sdk/test/*.test.cjs

# 3. Web application tests (78 passing)
node --test apps/web/tests/*.test.mjs

# 4. Mobile app tests (7 passing)
pnpm --filter @kite/mobile test

# 5. Full monorepo typecheck (SDK, Web, Mobile)
pnpm typecheck

# 6. Production Web build (Next.js 15 App Router, 35 routes)
pnpm build:web
```
