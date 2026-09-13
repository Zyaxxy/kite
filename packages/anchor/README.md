# Kite delegated settlement prototype

This workspace no longer exposes synthetic basket minting, deposits, or redemption. The historical `kite-vault` crate/program name is retained for local tooling; its instruction ABI and account layout have changed. **Do not upgrade an existing deployment in place.** There is no configured mainnet deployment and neither app routes user funds through this program.

The program is a bounded, direct wallet-to-wallet settlement primitive:

1. The owner creates a plan and approves its PDA for a finite `amount_per_cycle × max_cycles` allowance. No tokens move during creation.
2. A signer acting as counterparty supplies the authorized minimum output from its own inventory. The program transfers that inventory directly to the owner's pinned output account and the fixed installment directly from the owner's input account to the counterparty. Both transfers and the schedule update are atomic.
3. The owner can cancel, which disables the plan and revokes its remaining allowance. Independent SPL Token revocation also immediately prevents execution.

Only the legacy SPL Token program is supported. Native SOL must already be wrapped. Token-2022 mints, transfer hooks, fees, arbitrary CPI routes, and pooled custody are intentionally absent. The app's normal Jupiter swaps remain independent and can support broader assets.

A fixed minimum output is an owner-authorized limit order, not a current market-price guarantee. It is not safe to label this as automated best-execution DCA. A production SIP requires a reviewed routing adapter, fresh price limits, scheduling operations, account-extension support, and a separate security review. A malicious or opportunistic counterparty can choose any output at or above the signed minimum; choose bounded terms and expiry accordingly.

## Invariants

- Owner signature on create/cancel, signer on settlement; no admin spending authority.
- Plan PDA uses `sip`, owner and unique u64 plan ID; canonical bump pinned in state.
- Source/destination addresses, mints and token owners are pinned.
- At most one installment per interval, with no overdue catch-up burst.
- Positive output floor, finite cycle cap, fixed expiry, checked u64/i64 arithmetic.
- Only audited SPL Token instructions receive PDA signing authority; no arbitrary remaining accounts or CPI target.
- Final source/output deltas are checked after CPI.
- Cancelled state is retained as a small tombstone so old plan IDs cannot be reused. Rent recovery is not implemented.
- A source token account has one delegate; creating a plan rejects existing delegates. Separate simultaneous plans need separate source token accounts.

## Verification

From the repository root:

```sh
node node_modules/typescript/bin/tsc -p packages/sdk/tsconfig.json
node --test packages/sdk/test/subscriptions.test.cjs
cargo test --locked --manifest-path packages/anchor/Cargo.toml
```

For runtime integration, install the compatible Anchor and Solana SBF tools, create a **local test wallet**, and run `anchor test` from this directory. `tests/sip.test.cjs` refuses non-local RPC hosts and tests account substitution, rollback, interval gating, cancellation authorization and independent revocation using local fixture mints. The local program identity in `Anchor.toml` must match the deployed test keypair; use Anchor's local key synchronization before testing. No test keys or validator ledger belong in git.

Recorded validation: host Rust 1.85.1 tests passed; SBF compilation passed using official platform-tools v1.57 (Rust 1.95, `sbpf-solana-solana` target); all five integration tests passed on an isolated Agave 2.1.21 local validator. The older platform-tools v1.48 cannot parse the existing Rust 2024-edition dependencies. Use a current SBF compiler rather than silently downgrading cryptographic dependencies.

These checks do not replace real issuer-account compatibility tests, fuzzing, or an independent program audit. See [the protocol review](../../docs/protocol-security.md) for the recorded checks and open deployment gates.

### SBF build with the verified platform compiler

If an installed Anchor CLI selects an older platform compiler, use a current official [platform-tools release](https://github.com/anza-xyz/platform-tools/releases). From the repository root, set `KITE_PLATFORM_TOOLS` to the extracted compiler directory:

```sh
RUSTC="$KITE_PLATFORM_TOOLS/rust/bin/rustc" \
CC="$KITE_PLATFORM_TOOLS/llvm/bin/clang" \
AR="$KITE_PLATFORM_TOOLS/llvm/bin/llvm-ar" \
CARGO_TARGET_SBPF_SOLANA_SOLANA_RUSTFLAGS='-Zremap-cwd-prefix=' \
"$KITE_PLATFORM_TOOLS/rust/bin/cargo" build --locked --release \
  --target sbpf-solana-solana --manifest-path packages/anchor/Cargo.toml
```

The shared SDK must be compiled before running the Node integration suite. A local validator can load the resulting stripped `.so` at the declared program ID using `--bpf-program`, avoiding any external deployment. Use a fresh temporary ledger and dedicated test wallet; bind RPC to loopback and set `ANCHOR_PROVIDER_URL`/`ANCHOR_WALLET` to those local resources. Keep generated keys and artifacts out of git.
