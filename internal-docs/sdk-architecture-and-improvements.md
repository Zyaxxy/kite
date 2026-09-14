# Kite SDK Architecture & Shared Modular Pipeline

This specification outlines the architecture, data models, math primitives, and transaction composition pipelines encapsulated within `@kite/sdk` (`packages/sdk`).

All cross-platform contracts, atomic transaction builders, precision calculations, and recurring investment mechanisms have been **fully implemented, tested, and verified**.

---

## Executive Summary & Module Architecture

The `@kite/sdk` package serves as the single source of truth for all business logic, financial accounting, and on-chain Solana transaction builders shared across `apps/web` and `apps/mobile`.

```
packages/sdk/src/
  ├── accounting.ts       # BigInt token math, portfolio aggregation, and paper simulation
  ├── baskets.ts          # 12 curated basket definitions and largest-remainder allocator
  ├── markets.ts          # Issuer catalog discovery, Jupiter quote enrichment, and breadth
  ├── recurring.ts        # Atomic recurring investment composer (Subscriptions + Jupiter)
  ├── research.ts         # Timeseries normalization, technical indicators, and financial facts
  ├── transaction-v1.ts   # Solana V1 message serialization, compute budgeting, and fees
  └── jupiter-idl/        # Pinned program IDL for deterministic instruction parsing
```

---

## Key Architectural Solutions & Remediations (All Fixed)

### 1. Atomic Multi-Leg Basket Purchases (Fixed & Verified)
- **Problem**: Earlier multi-stock purchases risked partial execution or required multiple wallet approvals.
- **Resolution (Fixed)**: 
  - `composeBasketTransactionV1` takes an array of quoted legs from Jupiter Swap V2 `/swap/v2/build` and composes them into a **single atomic V1 transaction**.
  - Setup instructions (user ATA creation, WSOL wrapping) and cleanup instructions are verified and bounded to the user's authority.
  - If any individual stock swap fails or exceeds slippage tolerances, the entire transaction reverts on-chain, guaranteeing zero partial-fill states.

### 2. The Atomic Recurring Investment Engine (Fixed & Verified)
- **Problem**: Raw Solana Subscriptions permissions allow delegates to withdraw funds without enforcing immediate stock purchase and delivery.
- **Resolution (Fixed)**:
  - Built `buildAtomicRecurringTransaction`: merges the Subscriptions `collect` instruction and Jupiter Swap V2 `swap` instructions into a single atomic execution unit.
  - Funding tokens are collected directly into the swap inputs and settled into the user's owned Associated Token Accounts in the same atomic instruction sequence.
  - The transaction rolls back completely if delivery fails, eliminating counterparty trust assumptions.

### 3. Route Account Optimization & Sizing Safeguards (Fixed & Verified)
- **Problem**: Deep AMM routing for complex multi-leg baskets (e.g. `SOL-MAG7`) could generate account footprints exceeding the 64-account Solana limit.
- **Resolution (Fixed)**:
  - The composer prioritizes direct liquidity pools (Raydium CPMM, Orca Whirlpools), significantly reducing intermediate hop accounts.
  - System accounts, program IDs, and common mints are deduplicated inline.
  - Pre-flight account count assertions reject oversized combinations before presenting quotes to the user, preventing dropped transactions and wasted gas.

### 4. Zero-Leakage Integer Math via Largest Remainder Method
- All basket distributions utilize BigInt arithmetic and the **Hare-Niemeyer Largest Remainder Method**.
- The algorithm computes target allocations in basis points ($10,000\text{ bps} = 100\%$), allocates floor integer units to each constituent, and distributes remaining remainder units by largest fractional weight.
- Guarantees $100.00\%$ capital allocation with zero dust leakage.

---

## Core Module Specifications

### `accounting.ts`
- Manages portfolio aggregation for standard SPL and Token-2022 accounts.
- Distinguishes raw integer units from UI-adjusted amounts using issuer corporate-action multipliers.
- Implements immutable state transitions for virtual $10,000 Paper Sandbox accounts.

### `transaction-v1.ts`
- Encapsulates Solana V1 transaction composition using Kit 8 serialization.
- Enforces explicit `ComputeBudgetProgram` instructions:
  - `setComputeUnitLimit`: Bounded to realistic execution estimates.
  - `setComputeUnitPrice`: Sets micro-lamport priority fees for rapid inclusion.
- Serializes inline account addresses without requiring Address Lookup Tables (ALTs).

### `research.ts`
- Normalizes Yahoo Finance daily OHLCV bars into continuous timeseries.
- Calculates Wilder's 14-period RSI and 20/50/200-session Simple Moving Averages.
- Parses annual and quarterly balance sheets, income statements, and cash flows with reported currency preservation.

---

## Automated Test Coverage

The SDK test suite (`packages/sdk/test/`) runs on every commit:
- `baskets.test.cjs`: Tests 12 curated baskets, largest remainder math, and missing constituent handling.
- `accounting.test.cjs`: Validates BigInt precision, overspending rejection, and paper account immutability.
- `recurring.test.cjs`: Exercises atomic single-transaction recurring composition and rollback simulation.
- `transaction-v1.test.cjs`: Asserts V1 byte limits, compute budget headers, and account counts.
- `oracle-integrity.test.cjs`: Verifies Pyth Hermes and Push Oracle account deserialization.

---

## Architecture References

- [Recurring Investing Operations Specification](recurring-investing-operations.md)
- [Mainnet Recurring Payments Protocol](mainnet-recurring-payments.md)
- [Protocol Security & Threat Model](protocol-security.md)
- [Deployment Readiness & Launch Verification](deployment-readiness.md)
