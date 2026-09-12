# Build Context: Kite

- **Phase**: build
- **App Name**: Kite
- **Updated At**: 2026-09-12T08:50:00Z
- **Hackathon**: Solana Foundation Tokenized Stocks Hackathon ($100,000 Prize Pool)
- **Deadline**: Friday, 18 September 2026, 4:00pm ET
- **Architecture Pattern**: Multi-App Monorepo (Next.js Web + React Native / Expo Mobile + Anchor Vault + Shared TypeScript SDK)
- **Agent Guidelines**: Configured in `AGENTS.md`, `.cursorrules`, and `.cursor/rules/`

## Stack & Workspace Layout
- **Root**: Turborepo + pnpm workspaces (`/home/utkarsh/Projects/kite`)
- **Web App (`apps/web`)**: Next.js 15 App Router, Tailwind CSS, Lucide Icons, `@solana/wallet-adapter-react`
- **Mobile App (`apps/mobile`)**: React Native, Expo, `@solana-mobile/mobile-wallet-adapter-protocol` (MWA)
- **Anchor Program (`packages/anchor`)**: Anchor `1.1.2`, Solana CLI `3.1.10`, `programs/kite-vault` (basket mint/burn & multi-swap CPI)
- **Shared SDK (`packages/sdk`)**: TypeScript library for basket configurations (MAG7, AI Infra), Pyth oracle feeds, and Jupiter DCA helpers

## Installed Skills
- **Skills**: `programs-anchor`, `phantom-connect-skill`, `solana-kit-skill`

## Build Status
```json
{
  "mvp_complete": false,
  "tests_passing": false,
  "devnet_deployed": false
}
```
