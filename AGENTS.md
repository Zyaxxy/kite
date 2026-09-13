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
  │   └── sdk/                     # Shared TypeScript SDK (@kite/sdk)
  ├── package.json                 # Monorepo workspaces root (Turborepo)
  └── turbo.json                   # Build orchestrator
```

---

## Environment & Tooling

- **Node.js**: v24.12.0
- Mainnet transactions use the TypeScript SDK: Kit 8 for V1 composition and official Solana Subscriptions for recurring payments. No custom Anchor program or vault deployment is required.

---

## Key Commands

```bash
# Run web dApp locally
pnpm dev:web

# Run mobile app locally
pnpm dev:mobile

# Build shared SDK
pnpm build:sdk

```

---

## Code Guidelines & Standards

### TypeScript / Frontend (`apps/web`, `apps/mobile`, `packages/sdk`)
- Write modular, strictly-typed TypeScript without `any` where possible.
- Shared business logic, types, and oracle helpers MUST live in `packages/sdk` so both web and mobile share a single source of truth.
- Web uses `@solana/wallet-adapter-react` and dynamic imports for wallet modal components to prevent SSR hydration mismatches.
- Mobile uses `@solana-mobile/mobile-wallet-adapter-protocol` for non-custodial signing with Phantom, Solflare, or Seed Vault on Solana Saga / Seeker.

---

## Primitives & Protocols
- **Pyth Network:** Real-time equity oracle feeds (`@pythnetwork/pyth-solana-receiver`).
- **Jupiter:** Atomic multi-leg swaps using the Swap V2 build API.
- **Solana Subscriptions:** The official deployed shared program bounds recurring buyer withdrawals. A buyer-controlled keeper signs collections. It does not enforce stock delivery.
- **SPL Token / Token-2022:** Direct wallet holdings and delegated token payments. No synthetic basket mint or Kite vault. Reject unsupported extensions rather than bypassing their checks.
