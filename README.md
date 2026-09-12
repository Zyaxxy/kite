# Kite — Non-Custodial Neo-Brokerage on Solana
---

## Overview

**Kite** is a multi-platform (Web & Mobile) neo-brokerage bringing **1-click thematic stock baskets**, **automated non-custodial Systematic Investment Plans (SIPs / DCA)**, and **real-time market sentiment intelligence** to Solana's tokenized equities.

In traditional finance, 85% of the global population is locked out of US equities due to geographic restrictions, Social Security Number requirements, and 3-to-5 day ACH clearing delays. On Solana, tokenized stocks already trade 24/7. **Kite makes owning and using them 10x better than Robinhood.**

---

## Key Features

1.  **1-Click Thematic Stock Baskets**
   - Mint curated index baskets in a single atomic Solana transaction with USDC.
   - Flagship baskets:
     - **`MAG7` (Magnificent 7 Tech):** Equal-weighted Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta, and Tesla.
     - **`AI-LEADERS` (AI Infrastructure):** Concentrated exposure to Nvidia, Microsoft, and Alphabet.
     - **`PRE-TECH` (Pre-IPO Giants):** Tokenized secondary pre-market shares of OpenAI, SpaceX, and Stripe.

2.  **Non-Custodial Recurring SIPs (DCA)**
   - Set up automated dollar-cost averaging (e.g. *$25 USDC every Monday into MAG7 or NVDA*).
   - Onchain `SipPosition` program accounts manage intervals and execution permissionlessly.

3. **Real-Time Stock Intelligence & Sentiment**
   - Live Pyth equity price feeds for sub-second valuation updates.
   - Algorithmic bull/bear sentiment scores (-1.0 to +1.0) derived from market catalysts, options flow, and onchain volatility.

4. **Mobile-First Experience**
   - React Native + Expo mobile dApp equipped with the **Solana Mobile Wallet Adapter (MWA)** for seamless non-custodial signing on Android, iOS, and Solana Saga / Seeker.

5.  **1-Click Devnet Faucet for Judges & Testers**
   - One-click navbar faucet button that instantly mints $1,000 Devnet USDC, 5 xNVDA, and transfers 0.1 SOL for gas to any connected Phantom or Solflare wallet.

---

## Deployed Solana Devnet Addresses

| Asset | Ticker | Decimals | Solana Devnet Mint Address | Explorer |
| :--- | :---: | :---: | :--- | :--- |
| **Devnet USDC** | `USDC` | 6 | `FXzF7tP42CgEHsKxphXXJFTi7rBmAxWJFUUBApMHWJnx` | [View on Solscan](https://explorer.solana.com/address/FXzF7tP42CgEHsKxphXXJFTi7rBmAxWJFUUBApMHWJnx?cluster=devnet) |
| **Nvidia Corp.** | `xNVDA` | 6 | `BjM1yGWGA4rTvF3wWb8UsdqDsVfSfLxt96QWssi9PUZJ` | [View on Solscan](https://explorer.solana.com/address/BjM1yGWGA4rTvF3wWb8UsdqDsVfSfLxt96QWssi9PUZJ?cluster=devnet) |
| **Apple Inc.** | `xAAPL` | 6 | `2CP8apFcaZoqHQPLwsyyirwEwdjkix4wHkM47krdA9Nj` | [View on Solscan](https://explorer.solana.com/address/2CP8apFcaZoqHQPLwsyyirwEwdjkix4wHkM47krdA9Nj?cluster=devnet) |
| **Microsoft Corp.** | `xMSFT` | 6 | `DjNqiC3AtAzVPfpXnHvdP3vK6cXVkFBjf41ui7XEcWig` | [View on Solscan](https://explorer.solana.com/address/DjNqiC3AtAzVPfpXnHvdP3vK6cXVkFBjf41ui7XEcWig?cluster=devnet) |
| **Tesla Inc.** | `xTSLA` | 6 | `8uQ64zKYmXnEUL47namukKMELspe5D8ifhbyf1cGejmJ` | [View on Solscan](https://explorer.solana.com/address/8uQ64zKYmXnEUL47namukKMELspe5D8ifhbyf1cGejmJ?cluster=devnet) |
| **Amazon.com Inc.** | `xAMZN` | 6 | `AoPDHS1YqD7uUrBGQTDmfFj2Z17U3osU9vbBYNEdAfGB` | [View on Solscan](https://explorer.solana.com/address/AoPDHS1YqD7uUrBGQTDmfFj2Z17U3osU9vbBYNEdAfGB?cluster=devnet) |
| **Alphabet Inc.** | `xGOOGL` | 6 | `raePRBVRtcwd4kj33NDCSHre82wSHrDyv2Sgcm8v4GC` | [View on Solscan](https://explorer.solana.com/address/raePRBVRtcwd4kj33NDCSHre82wSHrDyv2Sgcm8v4GC?cluster=devnet) |
| **Meta Platforms** | `xMETA` | 6 | `DtLy28aPGUuWHtx1xAMY9GuViQN39VqQPXg48sD5u4FP` | [View on Solscan](https://explorer.solana.com/address/DtLy28aPGUuWHtx1xAMY9GuViQN39VqQPXg48sD5u4FP?cluster=devnet) |
| **OpenAI Pre-Stock** | `preOPENAI` | 6 | `ANWLjddHcF8qs5N34VxQLRTLAKaLKBKy4x4zXttrtpqF` | [View on Solscan](https://explorer.solana.com/address/ANWLjddHcF8qs5N34VxQLRTLAKaLKBKy4x4zXttrtpqF?cluster=devnet) |
| **SpaceX Pre-Stock** | `preSPACEX` | 6 | `BcHWdywyL3APuSkdGXTNY1rw8aqXDURZbH4Wv6PHoStE` | [View on Solscan](https://explorer.solana.com/address/BcHWdywyL3APuSkdGXTNY1rw8aqXDURZbH4Wv6PHoStE?cluster=devnet) |
| **Stripe Pre-Stock** | `preSTRIPE` | 6 | `25y9TFRReWN822h9buyGUTMBAarty2uzDbWwGhN4esqb` | [View on Solscan](https://explorer.solana.com/address/25y9TFRReWN822h9buyGUTMBAarty2uzDbWwGhN4esqb?cluster=devnet) |

---

## Monorepo Architecture

```
kite/
  ├── apps/
  │   ├── web/                     # Next.js 15 App Router dApp (Solana Wallet Adapter, Tailwind CSS)
  │   └── mobile/                  # React Native Expo app (Solana Mobile Wallet Adapter)
  ├── packages/
  │   ├── anchor/                  # Anchor framework program (`kite-vault`)
  │   └── sdk/                     # Shared TypeScript SDK (@kite/sdk)
  ├── pnpm-workspace.yaml          # pnpm monorepo workspace configuration
  └── turbo.json                   # Build pipeline
```

---

## Quickstart Guide

### Prerequisites
- Node.js >= 20
- pnpm >= 9
- Solana CLI & Anchor CLI

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Run Web dApp Locally
```bash
pnpm dev:web
```
Open `http://localhost:3000` in your browser.

### 3. Run Mobile App (Expo)
```bash
pnpm dev:mobile
```

### 4. Build Anchor Program
```bash
pnpm build:anchor
```

---

## Testing Flow for Judges

1. Open `http://localhost:3000` and connect your **Phantom** or **Solflare** wallet (switch network to **Devnet** in wallet settings).
2. Click the green **"Devnet Faucet"** button in the navbar.
3. Verify that you instantly receive **$1,000 Devnet USDC**, **5 xNVDA tokens**, and **0.1 SOL for gas**.
4. Go to **Baskets**, select `MAG7` or `AI-LEADERS`, and click **Buy Basket**.
5. Go to **SIPs**, set up a weekly recurring plan, and inspect your active onchain order.
