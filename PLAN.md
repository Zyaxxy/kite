# Implementation Plan: Pure V1 Dual-Route Architecture (No ALTs Needed)
## VERY IMPORTANT REASON WITH YOURSELF IF THIS PLAN CAN BE IMPROVED. IMPROVE IT AND THEN PROCEED DONT CREATE UNNECCESARY MD FILE
## Goal Description
Implement a **pure V1 Dual-Route Architecture** that completely eliminates Address Lookup Tables (ALTs) and their operational overhead (no RPC table fetching, no active deactivation checks, no ALT metadata mismatches):
1. **Zero Asset Counting (Account-Driven):** The router inspects total unique runtime accounts across all swap legs. If total accounts $\le 64$, it selects **Route 1**; if total accounts $> 64$, it selects **Route 2**.
2. **Route 1 — Single Atomic V1 Swap (Accounts $\le 64$):** Compiles as a single Solana Transaction V1 via `@solana/kit-v1`. Zero Jito tip, 1 user signature, direct RPC broadcast, 100% on-chain atomicity. **No ALTs required.**
3. **Route 2 — V1 + Jito Bundles (Accounts $> 64$):** Partitions swap legs across 2 to 5 ordered **V1 transactions** (up to 4,096 bytes per transaction). Attaches the dynamic Jito tip floor to the final V1 chunk, approves all chunks in one modal via `signAllTransactions` (and single MWA session on mobile), and submits to the Jito Block Engine (`https://mainnet.block-engine.jito.wtf/api/v1/bundles`). **No ALTs required.**
4. **Use Old Landing page but design just change the CTA Text which makes more sense and Showcases the All the Factors Not just Recurring and not just baskets**
5. **Create More Baskets and Other than the V1 Tag showcase which basket uses JITO**

6. **Redesign the Porfolio Page use Browser caching and More Beatiful porfolio page check 21stdev for reference**
---

## Architectural Breakthrough: Why Pure V1 Eliminates ALTs

> [!TIP]
> ### How V1 Completely Bypasses Address Lookup Tables
> - In **V0**, transactions were capped at **1,232 bytes**. Because a single 32-byte public key consumes substantial space, V0 forced developers to create, fund, and fetch on-chain Address Lookup Tables (ALTs) to compress addresses into 1-byte indices.
> - In **V1 (SIMD-0296)**, the transaction packet ceiling is raised to **4,096 bytes**.
> - Even with 64 accounts (the SVM runtime lock maximum), inlining all 64 public keys directly takes:
>   $$64 \times 32 \text{ bytes} = 2,048 \text{ bytes}$$
> - 2,048 bytes comfortably fits inside the 4,096-byte V1 envelope!
> - **Result:** We can build both single transactions and multi-transaction bundles using **direct, static account inlining in V1**.
> - We can deprecate `jupiter-lookup-tables.ts` from the hot execution path, eliminating table-fetch RPC overhead, deactivation race conditions, and lookup validation failures!

```
               ┌─── Receive Basket Order Request (2–12 assets) ───┐
               │                                                  │
               ▼                                                  │
   Inspect Total Unique Runtime Accounts Across All Swap Legs     │
               │                                                  │
               ├───────────────────┬───────────────────┐          │
               │                   │                   │          │
    [Total Accounts ≤ 64]          │          [Total Accounts > 64]
    (Fits single V1 4096B)         │                   │          │
               │                   │                   │          │
               ▼                   │                   ▼          │
    ┌──────────────────────┐       │        ┌──────────────────────┐
    │       ROUTE 1        │       │        │       ROUTE 2        │
    │ Single Atomic V1     │       │        │ V1 + Jito Bundle     │
    │                      │       │        │                      │
    │ • Version: 1         │       │        │ • Version: 1         │
    │ • NO ALTs Needed     │       │        │ • NO ALTs Needed     │
    │ • Zero Jito Tip      │       │        │ • 2 to 5 V1 Chunks   │
    │ • 1 User Approval    │       │        │ • signAll / MWA      │
    │ • Direct RPC Send    │       │        │ • Dynamic Jito Tip   │
    │ • 100% Atomic        │       │        │ • Jito Block Engine  │
    └──────────────────────┘       │        │ • Same-slot check    │
                                   │        └──────────────────────┘
                                   ▼
                   [Wallet only supports V0?]
                                   │
                                   ▼
                       Single Atomic V0 (0 tip)
```

---

## User Review Required

> [!IMPORTANT]
> ### 1. Complete Removal of ALTs in V1 Flows
> In Route 1 and Route 2, transactions will inline static accounts directly via `@solana/kit-v1`. The server will no longer execute `loadVerifiedLookupTables` RPC calls for V1 builds.
>
> ### 2. Pure Account-Driven Routing
> Decisions are made strictly by whether total unique accounts exceed the 64-account runtime limit. No asset-counting heuristics (`assets <= 4`).
>
> ### 3. Up to 5 Transactions in Jito Bundles
> `BASKET_MAX_TRANSACTIONS = 5` supports baskets of up to 12 assets. Users approve all chunks simultaneously via `signAllTransactions`.
>
> ### 4. Privy V1 Signing Activation
> Update `TradingAuth.tsx` so Privy embedded wallets advertise `[0, 1]`.

---

## Proposed Changes

### Component 1: SDK Basket Engine (`packages/sdk`)

#### [MODIFY] [`packages/sdk/src/basket/mainnet.ts`](file:///home/utkarsh/Projects/kite/packages/sdk/src/basket/mainnet.ts)
- Add `composeBasketV1Chunks`:
  Partitions swap legs into 2 to 5 V1 chunks where each chunk has $\le 64$ unique accounts and $\le 4,096$ serialized bytes.
  Appends the Jito tip instruction exclusively to the final V1 chunk.
  No lookup tables required!
```typescript
export async function composeBasketV1Chunks(params: {
  payer: string;
  blockhash: string;
  lastValidBlockHeight: number;
  legs: BasketSwapLeg[];
  finalTipInstruction?: TransactionInstruction;
  priorityFeeLamports?: number;
}): Promise<ComposedV1Chunk[]> {
  // Backtracking partitioner: chunks legs into at most 5 V1 transactions
  // Each chunk validates accounts.size <= 64 and bytes <= 4096
}
```

#### [MODIFY] [`packages/sdk/src/basket/bundle.ts`](file:///home/utkarsh/Projects/kite/packages/sdk/src/basket/bundle.ts)
- Update `BASKET_MAX_TRANSACTIONS = 5`.
- Remove asset-count heuristics.
- Update `BasketBundleOrder` interface:
```typescript
export interface BasketBundleOrder extends Omit<BasketOrder, "transaction" | "serializedBytes" | "transactionVersion"> {
  kind: "bundle";
  transactions: string[];
  transactionVersion: 0 | 1;
  serializedBytes: number[];
  tipLamports: number;
  atomicityWarning: string;
}
```

#### [MODIFY] [`packages/sdk/src/basket/custom.ts`](file:///home/utkarsh/Projects/kite/packages/sdk/src/basket/custom.ts)
- Update `MAX_CUSTOM_BASKET_LEGS = 12`.

#### [MODIFY] [`packages/sdk/src/client/kite-client.ts`](file:///home/utkarsh/Projects/kite/packages/sdk/src/client/kite-client.ts)
- Accept `transactionVersion: 0 | 1` and 2 to 5 transactions in `validBundleOrder`.

---

### Component 2: Server Routing & Preflight API (`apps/web`)

#### [MODIFY] [`apps/web/lib/server/basket-order.ts`](file:///home/utkarsh/Projects/kite/apps/web/lib/server/basket-order.ts)
- Bypass `loadVerifiedLookupTables` when building V1 routes.
- Calculate total unique runtime accounts across all legs.
- Implement account-driven routing:
```typescript
// Count unique accounts across all swap legs
const allInstructions = legs.flatMap((leg) => leg.instructions);
const uniqueAccounts = new Set<string>([taker]);
for (const ix of allInstructions) {
  uniqueAccounts.add(ix.programId.toBase58());
  for (const key of ix.keys) {
    uniqueAccounts.add(key.pubkey.toBase58());
  }
}

const supportsV1 = Boolean(
  input.supportedTransactionVersions?.includes(1) && (await mainnetV1Active()),
);

// If total accounts fit within the 64-account runtime ceiling:
if (uniqueAccounts.size <= 64) {
  // ROUTE 1: Single Atomic V1 (Zero Jito Tip, NO ALTs)
  if (supportsV1) {
    try {
      const v1Tx = await composeV1Transaction({
        payer: taker,
        blockhash: lifetime.blockhash,
        lastValidBlockHeight: lifetime.lastValidBlockHeight,
        instructions: allInstructions,
        allowV1: true,
        priorityFeeLamports: 10_000,
      });
      await simulateComposed(v1Tx.transaction, addresses);
      return await authorizeComposed({ ...baseOrder, ...v1Tx, transactionVersion: 1 });
    } catch {
      // Fall through to V0 single attempt if V1 hit size limits
    }
  }

  // Attempt Single V0 (with ALTs as fallback for V0-only wallets, Zero Jito Tip)
  try {
    const lookupTables = await loadVerifiedLookupTables(routeAlts);
    const singleV0 = composeV0Transaction({
      payer: taker,
      blockhash: lifetime.blockhash,
      instructions: allInstructions,
      lookupTables,
      priorityFeeLamports: 10_000,
    });
    await simulateComposed(singleV0.transaction, addresses);
    return await authorizeComposed({ ...baseOrder, ...singleV0, transactionVersion: 0 });
  } catch {
    // Falls through to Route 2
  }
}

// ROUTE 2: Scaled Jito Bundle (V1 + Jito, NO ALTs)
const tip = await prepareJitoTip(taker);

let chunks: Array<{ transaction: string; serializedBytes: number; transactionVersion: 0 | 1 }>;

if (supportsV1) {
  // Build V1 chunks: static accounts, up to 4096 bytes per chunk, NO ALTs!
  chunks = await composeBasketV1Chunks({
    payer: taker,
    blockhash: lifetime.blockhash,
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
    legs,
    finalTipInstruction: tip.instruction,
    priorityFeeLamports: 10_000,
  });
} else {
  // V0 fallback with ALTs for legacy wallets
  const lookupTables = await loadVerifiedLookupTables(routeAlts);
  chunks = composeBasketV0Chunks({
    ...composition,
    lookupTables,
    finalTipInstruction: tip.instruction,
  });
}

for (const chunk of chunks) {
  await simulateComposed(chunk.transaction, addresses);
}

return await authorizeBundle({
  ...baseBundleOrder,
  transactions: chunks.map((c) => c.transaction),
  transactionVersion: supportsV1 ? 1 : 0,
  tipLamports: tip.lamports,
  atomicityWarning: BUNDLE_ATOMICITY_WARNING,
});
```

#### [MODIFY] [`apps/web/lib/server/bundle-authorization.ts`](file:///home/utkarsh/Projects/kite/apps/web/lib/server/bundle-authorization.ts)
- Update `transaction()` to deserialize both V1 and V0 transactions using `inspectWalletTransaction`:
```typescript
async function transaction(encoded: string, taker: string) {
  if (typeof encoded !== "string" || encoded.length > 5500)
    throw new Error("Invalid bundle transaction.");
  const { transaction: tx, message, bytes } = await inspectWalletTransaction(encoded);
  if (message.version !== 0 && message.version !== 1)
    throw new Error("Unsupported bundle transaction version.");
  if (bytes.length > (message.version === 1 ? 4096 : 1232))
    throw new Error("Bundle transaction exceeds size limit.");
  if (message.staticAccounts[0] !== taker)
    throw new Error("The reviewed wallet must be the fee payer.");
  if (message.staticAccounts.length > 64)
    throw new Error("Bundle transaction exceeds 64 accounts.");
  return { tx, message, bytes };
}
```
- Allow 2 to 5 bundle transactions.

#### [MODIFY] [`apps/web/lib/pending-mainnet.ts`](file:///home/utkarsh/Projects/kite/apps/web/lib/pending-mainnet.ts)
- Allow up to 5 transactions and base64 strings up to 5,500 characters.

#### [MODIFY] [`apps/web/app/api/bundles/execute/route.ts`](file:///home/utkarsh/Projects/kite/apps/web/app/api/bundles/execute/route.ts)
- Support 2 to 5 transactions, payload size up to 25KB.

#### [MODIFY] [`apps/web/app/api/bundles/status/route.ts`](file:///home/utkarsh/Projects/kite/apps/web/app/api/bundles/status/route.ts)
- Support 2 to 5 transactions, payload size up to 25KB.

---

### Component 3: Client & Wallet Signing (`apps/web`)

#### [MODIFY] [`apps/web/components/trading/TradingAuth.tsx`](file:///home/utkarsh/Projects/kite/apps/web/components/trading/TradingAuth.tsx)
- Enable V1 for Privy embedded wallets: `[0, 1]`.
- Allow up to 5 transactions in `signTransactions`.
- Retain `adapter.signAllTransactions` for batch approval.

#### [MODIFY] [`apps/web/components/kite/BasketBuilder.tsx`](file:///home/utkarsh/Projects/kite/apps/web/components/kite/BasketBuilder.tsx)
- Allow selecting up to 12 assets.

#### [MODIFY] [`apps/web/components/trading/ActualBasketPanel.tsx`](file:///home/utkarsh/Projects/kite/apps/web/components/trading/ActualBasketPanel.tsx)
- Display order details dynamically:
  - Route 1: *"Single atomic V1 swap · 0 tip"*
  - Route 2: *"{N} V1 transactions · Jito bundle"*, dynamic tip floor, atomicity notice.

---

## Verification Plan

### Automated Tests
```sh
# 1. Build SDK
pnpm build:sdk

# 2. Run SDK tests
pnpm --filter @kite/sdk test

# 3. Run Web server tests
pnpm --filter @kite/web test

# 4. Check types
pnpm typecheck
```

### Specific Automated Test Scenarios
1. **Route 1 Verification ($\le 64$ accounts):**
   - Assert single V1 transaction generated.
   - Assert zero lookup tables requested or passed.
   - Assert zero Jito tip attached.
2. **Route 2 Verification ($> 64$ accounts):**
   - 10-asset basket -> assert partitioned into 4–5 V1 chunks.
   - Assert zero lookup tables requested or passed.
   - Assert Jito tip attached to final chunk.
   - Assert bundle authorization and signature verification succeed.
3. **No-ALT Verification:**
   - Spy on `loadVerifiedLookupTables` and verify it is **not called** when V1 routing is active.

### Manual Verification
1. **Single V1 Swap:** Select 3 assets, verify quote returns 1 V1 transaction, 0 tip, 1 approval.
2. **V1 + Jito Bundle:** Build a 10-asset basket, verify quote returns 4–5 V1 chunks with tip, `signAllTransactions` signs all in 1 modal.
