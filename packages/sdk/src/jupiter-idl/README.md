# Jupiter ExactIn instruction schema

`exact-in.ts` contains only the four supported ExactIn instructions and their transitively referenced Borsh types. It is protocol metadata, not generated market data. The validator is exported from the server SDK entry, so the IDL is not included in the native entry.

Source: Jupiter's program-owned Anchor IDL on Solana mainnet, read at finalized slot **446741075** on 2026-09-13.

- Program / IDL owner: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`
- IDL account: `C88XWfp26heEmDkmfSzeXP7Fd7GQJ2j9dDTUsyiZbUTa`
- Mainnet genesis: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`
- IDL authority observed: `9u9iZBWqGsp5hXBxkVZtBTuLSGNAG9gEQLgpuVw39ASg`
- SHA-256 of the complete inflated IDL JSON bytes: `3f0edbf2d65ec7be16b655348bcf63af70f3e64d19c68d9535048808167cc460`

[Onchain IDL account](https://explorer.solana.com/address/C88XWfp26heEmDkmfSzeXP7Fd7GQJ2j9dDTUsyiZbUTa), [official Jupiter build API](https://developers.jup.ag/docs/api-reference/swap/build), [Jupiter's original CPI repository](https://github.com/jup-ag/jupiter-cpi).

The older CPI IDL has only 39 swap variants; the fetched mainnet IDL has 186. The Surfpool scenario IDL has different discriminators and enum ordering and was not used. In particular, current `route_v2` puts amounts before its route vector and uses u16 fee fields. Reading an assumed footer is unsafe because it both misses V2 layouts and can accept trailing attacker-controlled data.

## Validation

The reader consumes the full Borsh payload from its discriminator, using explicit recursion, vector, byte and node limits. Unknown instruction/enum variants, invalid booleans/options, truncated fields and trailing bytes are rejected. Ledger and ExactOut variants are not supported. Encoded input, quoted output, slippage and fee fields must match the reviewed terms. An optional settlement check binds the account prefix to the signer, source account, destination account and mint identities.

`otherAmountThreshold` is not an independent encoded argument. The build API's threshold is checked for coherence using `quotedOutAmount - floor(quotedOutAmount * slippageBps / 10000)`. The captured, unsigned mainnet build fixture demonstrates this rounding: quoted output 100439, slippage 100 bps, threshold 99435. The code does not rewrite instruction bytes or infer its argument positions from the response JSON. Mainnet simulation and recipient balance checks remain mandatory. These tests do not establish funded execution or independently prove the program's runtime rounding implementation.

## Reviewed refresh procedure

1. Read `getGenesisHash` through the intended HTTPS RPC and require the mainnet genesis above.
2. Derive the Anchor IDL address: find the empty-seed program PDA, then `PublicKey.createWithSeed(base, "anchor:idl", program)`. Require the account owner to equal the Jupiter program.
3. Read the account with `getAccountInfoAndContext` at `finalized`. The Anchor IDL account has an 8-byte discriminator, a 32-byte authority, a little-endian u32 compressed-data length at byte 40, then zlib-compressed IDL JSON at byte 44. Inflate only that declared slice and hash the original inflated bytes.
4. Review the discriminators, argument order, account prefixes and type definitions for `route`, `shared_accounts_route`, `route_v2`, and `shared_accounts_route_v2`. Retain only those instructions and their transitively referenced types in `exact-in.ts`; preserve enum order exactly. Do not automatically enable new instruction variants.
5. Update the source slot/hash here and run the decoder, swap-build and investing-security tests. Unknown schemas must fail closed until reviewed. A new read-only build fixture may be captured without signing or submitting any transaction.
