# Recurring investing on devnet (CPMM + contract execution)

> Historical design: main was changed to a devnet subscription + mock-mint demonstration in `1048632`. This CPMM document is retained as design history, not current setup instructions. See [the current protocol](kite-guard-protocol.md) and [execution blockers](devnet-contract-audit.md).

This document captures the currently implemented devnet recurring model that uses a dedicated contract execution path for plan-driven basket and stock investments.

## What is implemented

- Recurring plans are created from the web API and stored as deterministic plan records.
- Funding withdrawals and swaps are executed in one on-chain contract flow.
- Plan execution can deliver either a single stock or a basket by splitting one funded amount across multiple swap legs.
- The implementation is currently designed and tested for **devnet only** and uses a scripted devnet xStock catalog and liquidity pools.

## Components

- Web UI: plan form, schedule builder, availability checks, and transaction approval.
- Recurring API: prepares plan instructions, validates the plan, and exposes readiness/health.
- Contract: executes the collect-and-swap cycle through CPMM swaps after permissioned funding is moved into the plan context.
- Runtime/SDK: shared schedule math, plan validation, deterministic allocations, and transaction builders.

## Devnet recurring runtime flow

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as Kite web / mobile UI
    participant API as Recurring API (devnet)
    participant C as Contract plan executor
    participant S as Solana Subscriptions
    participant P as CPMM swap pool
    participant W as User wallet

    U->>UI: Create recurring plan (stock or basket, funding mint, amount, schedule)
    UI->>API: POST /api/recurring (plan review payload)
    API->>API: Validate schedule, signatures, mint/decimals, basket consistency
    API-->>UI: Unsigned setup transaction bytes + plan digest
    UI->>W: Sign plan setup transaction
    W-->>UI: Signed setup tx
    UI->>API: Execute signed setup
    API->>API: Store plan hash + plan metadata
    API-->>UI: Setup accepted (plan active)
    Note over API,S: Recurring permission is bounded and revocable

    C->>S: collect + execute for due schedule index
    S-->>C: Delegated funding amount moved into plan context
    C->>P: For each basket leg or single stock: swap funding -> output mint
    P-->>C: Swapped output token amount credited to plan-derived account
    C->>W: Deliver each output to owner token account
    C-->>API: Execution receipt (run id, amounts, signature/result)
```

## Baskets, stocks, and allocation model

The basket execution path does not mint synthetic basket tokens.

1. A plan stores immutable output mints and weights in basis points.
2. The contract computes exact integer allocations for each output on every run.
3. Legs are executed independently by CPMM swap CPI in a single plan execution.
4. Output amounts are validated against configured minimums before finalizing.

```mermaid
flowchart LR
    A["Plan captures outputs:<br/>mintA 50% | mintB 30% | mintC 20%"] --> B["Collect funding to plan execution context"]
    B --> C["Compute weighted integer allocations"]
    C --> D["CPMM swap leg 1"]
    C --> E["CPMM swap leg 2"]
    C --> F["CPMM swap leg 3"]
    D --> G["Output to owner token account A"]
    E --> H["Output to owner token account B"]
    F --> I["Output to owner token account C"]
    G --> J["Plan run receipt"]
    H --> J
    I --> J
```

## State transitions

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Signed : owner signs setup
    Signed --> Active : setup verified and persisted
    Active --> Running : due schedule run succeeds
    Active --> Paused : owner revokes/soft pause
    Running --> Active : run success
    Running --> Failed : any leg fails / swap fails / validation fails
    Failed --> Active : can be retried after next schedule window
    Active --> Revoked : on-chain revocation confirmed
    Paused --> Active : explicit resume
    Revoked --> [*]
```

## Core checks performed in the devnet flow

- plan has finite schedule and bounded lifetime (no infinite plans)
- schedule index can only be run once per period
- no period catch-up accumulation
- funding token and output mints must be known and non-extended
- required authority roles are explicit and verified before execution
- minimum output and slippage safety checks are enforced per leg
- replay protection uses on-chain execution counters

## Known limits at the devnet stage

- Program IDs, pool mapping, and funding catalog are devnet-specific.
- Some devnet xStock mints are scripted and not fully liquidity-tested for long-duration production behavior.
- Mainnet wallet behavior, fees, and pool depth can differ materially from devnet.

## Why this is separate from legacy path

This is a contract-assisted route where swap execution is enforced by the plan program for the devnet model. The current product-wide recurring API also includes a legacy delegated-payment flow; the devnet contract path is the newer atomic-execution path and is intended for the staged migration path described below.

