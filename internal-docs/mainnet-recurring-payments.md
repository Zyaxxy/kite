# Solana Subscriptions Delegation Protocol & Recurring Payments Specification

This technical specification details the integration of the official on-chain [Solana Subscriptions Program](https://solana.com/docs/payments/subscriptions/recurring-delegation) (`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`) within Kite.

It documents the base on-chain delegation mechanics, permission lifetimes, authority derivation, and how the historical limitation of raw payment allowances has been **fully resolved via atomic transaction composition**.

---

## Executive Summary & Architectural Resolution

In standard Solana Subscriptions, a recurring token delegation permits an authorized buyer or executor to withdraw up to an approved limit per period. On its own, a raw delegation transfers funding tokens without on-chain enforcement of what is purchased.

### The Resolution: Atomic Investment Composition (Fixed & Implemented)
To solve this limitation and eliminate counterparty risk, Kite introduced the **Atomic Recurring Investment Engine** ([`recurring-investing-operations.md`](recurring-investing-operations.md)):
- Rather than executing an isolated funding withdrawal, Kite composes the Subscriptions `collect` instruction and Jupiter Swap V2 `swap` instructions into a **single atomic V1 transaction**.
- The funding tokens are debited from the owner's account and immediately routed into the designated stock/basket swap legs, delivering the tokenized equities directly to the owner's Associated Token Accounts (ATAs).
- If any stock leg fails or slippage bounds are exceeded, the entire transaction reverts atomically. The executor cannot withdraw funds without delivering the exact requested assets.

---

## On-Chain Delegation Mechanics

### 1. Subscription Authority Derivation & SPL Delegation
- When an owner approves their first recurring plan for a token mint, Kite initializes the user's per-mint **Subscription Authority** PDA:
  $$\text{PDA} = \text{findProgramAddress}([\text{b"authority"}, \text{owner\_pubkey}, \text{mint\_pubkey}], \text{PROGRAM\_ID})$$
- The owner's token account delegates spending authority to this PDA.
- Kite guarantees that an existing, unrelated token delegate is never silently overwritten. If an unrecognized delegate exists, the setup flow requires user acknowledgement or revocation first.

### 2. Time-Bounded, Non-Accumulating Limits
- **Finite Lifetimes**: All recurring delegations created through Kite are strictly time-bounded (maximum duration of 1 year).
- **Non-Accumulating Periods**: Unused allowance within a given period (e.g. daily, weekly, or monthly) does **not** roll over or accumulate into subsequent periods.
- **Explicit Fixed Cadence**: The on-chain program enforces minimum time spacing between collections, preventing unauthorized rapid drains.

### 3. Full Self-Custody & Direct On-Chain Revocation
- The owner retains absolute custody of their funds at all times.
- Users can revoke spending permissions instantly via Kite's UI or any standard Solana block explorer by calling the Subscriptions `revoke` instruction.
- Revocation closes the recurring delegation account and returns the on-chain account rent directly to the owner's wallet.

---

## API Endpoints & Transaction Pipeline

All endpoints enforce strict input validation, rate limiting, and private no-cache headers:

| Endpoint | Method | Purpose & Security Controls | Status |
| :--- | :---: | :--- | :---: |
| `/api/recurring` | GET | Queries active on-chain Subscriptions records for a wallet. | **Operational** |
| `/api/recurring` | POST | Composes unsigned V1 transaction to initialize authority and create plan delegation. | **Operational** |
| `/api/recurring/revoke` | POST | Composes unsigned V1 transaction to revoke on-chain delegation and reclaim rent. | **Operational** |
| `/api/recurring/collect` | POST | Internal handler for atomic execution; binds collection to immediate asset delivery. | **Operational** |
| `/api/transaction/execute` | POST | Validates HMAC signature, block-height validity, and broadcasts verified transaction. | **Operational** |

---

## Autonomous Execution Daemon (`run-recurring-investments.cjs`)

The execution worker runs on private, supervised infrastructure to trigger scheduled investments when their window opens:
1. **Key Isolation**: The worker operates using its own dedicated execution keypair with SOL for transaction fees. It never accesses or stores user private keys.
2. **Pre-Broadcast Simulation**: Every composed transaction must pass complete on-chain simulation (`simulateTransaction`) verifying that expected token deltas match the requested quote.
3. **Durable Intent Logging**: The worker logs signed transaction intent to persistent storage before broadcasting. If a process restart occurs during transmission, the worker safely reconciles the transaction on-chain rather than submitting a duplicate order.
4. **Supervisory Heartbeat**: The worker posts an authenticated heartbeat to the API every 60 seconds. If a worker goes offline for >3 minutes, new plan setups are temporarily paused with an informative status banner.
