# AGENTS.md

## Project: Kite (Non-Custodial Neo-Brokerage on Solana)

Kite is a multi-platform (Web & Mobile) neo-brokerage bringing 1-click thematic stock baskets (e.g. `SOL-MAG7`, `SOL-AI`), automated non-custodial Systematic Investment Plans (SIPs / DCA), and real-time market sentiment insights to Solana's tokenized equities.

Target: Solana Foundation $100,000 Tokenized Stocks Hackathon (Deadline: Friday, 18 September, 4:00pm ET).

---

## Workspace Architecture

```
kite/
  ├── apps/
  │   ├── web/                     # Next.js 15 App Router dApp (Wallet Adapter, Tailwind CSS)
  │   └── mobile/                  # React Native / Expo dApp (Solana Mobile Wallet Adapter)
  ├── packages/
  │   ├── anchor/                  # Anchor Framework workspace (`kite-vault` program)
  │   └── sdk/                     # Shared TypeScript SDK (@kite/sdk)
  ├── package.json                 # Monorepo workspaces root (Turborepo)
  └── turbo.json                   # Build orchestrator
```

---

## Environment & Tooling

- **Node.js**: v24.12.0
- **Solana CLI**: `solana-cli 3.1.10 (Agave)` (located in `~/.local/share/solana/install/active_release/bin`)
- **Anchor CLI**: `anchor-cli 1.1.2` (located in `~/.cargo/bin`)
- **Rust**: `rustc` / `cargo` (located in `~/.cargo/bin`)

When running shell commands involving `solana` or `anchor`, ensure the PATH includes:
```bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

---

## Key Commands

```bash
# Run web dApp locally
pnpm dev:web

# Run mobile app locally
pnpm dev:mobile

# Build shared SDK
pnpm build:sdk

# Compile Anchor program
pnpm build:anchor
# or inside packages/anchor:
anchor build

# Run Anchor tests
pnpm test:anchor
# or inside packages/anchor:
anchor test
```

---

## Code Guidelines & Standards

### Rust / Anchor (`packages/anchor`)
- Use Anchor 0.30+ conventions.
- Always use `checked_add`, `checked_sub`, `checked_mul` for mathematical calculations or return custom `KiteError::MathOverflow`.
- Strictly validate PDAs with `seeds` and `bump` constraints in account contexts.
- Enforce token mint constraints on all token account inputs.

### TypeScript / Frontend (`apps/web`, `apps/mobile`, `packages/sdk`)
- Write modular, strictly-typed TypeScript without `any` where possible.
- Shared business logic, types, and oracle helpers MUST live in `packages/sdk` so both web and mobile share a single source of truth.
- Web uses `@solana/wallet-adapter-react` and dynamic imports for wallet modal components to prevent SSR hydration mismatches.
- Mobile uses `@solana-mobile/mobile-wallet-adapter-protocol` for non-custodial signing with Phantom, Solflare, or Seed Vault on Solana Saga / Seeker.

---

## Primitives & Protocols
- **Pyth Network:** Real-time equity oracle feeds (`@pythnetwork/pyth-solana-receiver`).
- **Jupiter:** Atomic multi-leg swaps and onchain DCA / SIP routing.
- **SPL Token / Token-2022:** Non-custodial index basket token minting and transfer hooks.
