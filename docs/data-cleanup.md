# Runtime data cleanup

The September 2026 cleanup traced imports across web, mobile, SDK, scripts and tests before removing these unused modules:

- The `pyth.ts` mock insight map, including fixed prices, invented headlines and its fallback price.
- The isolated devnet client, mock mint catalogs, basket definitions, faucet helpers, empty SIP transaction builders and their deployment generator. The Anchor program and its tests remain independent.
- Headline keyword sentiment scores and the unused AI-summary fields from the real RSS news endpoint. The dashboard uses observed market breadth and volume, and continues to display sourced news.
- The unused `@pythnetwork/pyth-solana-receiver` dependency and its orphaned lockfile entries. The real Pyth REST/RPC adapter remains available.

SDK builds clear generated output first so removed prototype modules cannot persist in `dist`. Mainnet issuer catalogs, protocol mint identities, explicit paper-account simulation, basket allocation definitions and deterministic test fixtures remain: none serves fabricated market prices or company research to the application. The retired devnet HTTP endpoints still return 410 for old clients.

Import-reference searches, SDK TypeScript and web TypeScript checks passed after cleanup. Reference screenshots and unused design-source assets were retained because they are project inputs, not application data.
