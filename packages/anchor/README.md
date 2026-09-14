# Kite Guard v2 — devnet recurring execution

The Guard collects an owner-approved installment through the official Solana Subscriptions program and executes every approved stock or basket leg through the official Raydium **devnet** CPMM program. Its plan PDA signs these CPIs; the caller only signs transaction fees. The deployed legacy counter-only program must be upgraded separately before the v2 API can become ready. This change does not deploy programs, provision liquidity, or run a cron worker.

See [the protocol documentation](../../docs/kite-guard-protocol.md) for the application workflow and deployment requirements.

## Local verification

Prerequisites: the workspace JavaScript dependencies, Rust/Cargo, and Agave `cargo-build-sbf`. Verification used Rust 1.98.1 for native tests and cargo-build-sbf 4.1.0 / platform-tools v1.54 for SBF. Run from the repository root:

```sh
pnpm --filter @kite/sdk build
pnpm --filter @kite/anchor test:fixtures
pnpm --filter @kite/anchor test:build
pnpm --filter @kite/anchor test
```

`test:fixtures` only reads public devnet RPC accounts. It verifies the devnet genesis hash, executable program ownership and program-data addresses, then pins both downstream SBF binaries against the SHA-256 checksums in `tests/fixtures/runtime-programs.json`. A changed official deployment fails verification and requires a reviewed fixture update. Set `KITE_TEST_DEVNET_RPC` for another devnet endpoint. Binaries are cached under ignored `target/test-programs`; set `KITE_TEST_PROGRAM_DIR` to use a separate directory for fixture downloads and runtime tests, and pass that same directory to `cargo build-sbf --sbf-out-dir`.

`test` runs native Rust tests, regenerates and checks the committed IDL against Anchor macros, and runs LiteSVM tests. It does not load a wallet or submit a transaction to a network. After changing the public Rust ABI, run `pnpm --filter @kite/anchor idl:sync` and rebuild the SDK before testing.

## Runtime coverage and limits

The LiteSVM suite executes the compiled Guard and the actual pinned Subscriptions and Raydium SBF binaries. Test owners and fee payers are newly generated local keypairs. Mints, reserves, pools, and some existing plans are explicit local fixtures; they do not assert that public devnet liquidity has been provisioned.

Coverage includes:

- SDK-driven creation of a real Subscriptions authority and recurring grant, Guard admission, and a single-stock installment.
- A two-asset installment signed only by a transaction fee payer, with exact funding debit, token delivery, preserved incidental donations, and replay rejection.
- A second-leg slippage failure that rolls back the collection, first delivery, all pool/vault/oracle changes, delegation state, and Guard counters byte for byte.
- Actual delegation revocation, donation recovery, and account closure.
- Owner cancellation when empty staging and owner accounts are frozen; creation and execution still require mints without freeze authorities. A frozen nonempty token balance is subject to the SPL Token program's transfer restrictions.
- Capability probing and rejection of funding/output freeze authorities or creator-fee pools before collection.

The local runtime harness uses v0 transactions for its stock and two-asset cases. SDK tests separately verify V1 serialization and account limits for the public basket catalog. Neither test establishes successful submission against a newly upgraded public devnet Guard or provisioned pools.
