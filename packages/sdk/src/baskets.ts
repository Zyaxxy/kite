import { ThematicBasket } from './types';
import { DEVNET_MINTS } from './constants/devnet-mints';

export const CURATED_BASKETS: ThematicBasket[] = [
  {
    id: 'sol-ai-infra',
    name: 'AI Infrastructure Titans',
    ticker: 'dAI-TITAN',
    description: 'Automated non-custodial synthetic basket tracking the compute, foundry, and silicon foundation powering generative intelligence.',
    icon: 'Cpu',
    rebalanceIntervalDays: 7,
    assets: [
      { symbol: 'xNVDA', name: 'Nvidia Corporation', mint: DEVNET_MINTS['xNVDA']?.mint || 'BjM1yGWGA4rTvF3wWb8UsdqDsVfSfLxt96QWssi9PUZJ', weight: 3500, pythFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593', category: 'Semiconductors' },
      { symbol: 'xMSFT', name: 'Microsoft Corporation', mint: DEVNET_MINTS['xMSFT']?.mint || 'DjNqiC3AtAzVPfpXnHvdP3vK6cXVkFBjf41ui7XEcWig', weight: 2500, pythFeedId: '0xd0ca22c317926105f2843efc6291a1a2b2512f4c399738d7f7faea4b1eeea1e1', category: 'Cloud AI' },
      { symbol: 'xTSM', name: 'Taiwan Semiconductor Mfg.', mint: 'TSMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', weight: 2000, pythFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000', category: 'Pure-Play Foundry' },
      { symbol: 'xASML', name: 'ASML Holding N.V.', mint: 'ASMLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', weight: 1000, pythFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000', category: 'Lithography' },
      { symbol: 'xAVGO', name: 'Broadcom Inc.', mint: 'AVGOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', weight: 1000, pythFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000', category: 'Custom Silicon' },
    ]
  },
  {
    id: 'sol-mag7',
    name: 'Magnificent 7 Tech',
    ticker: 'MAG7',
    description: 'Equal-weighted exposure to Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta, and Tesla.',
    icon: 'Layers',
    rebalanceIntervalDays: 30,
    assets: [
      { symbol: 'xAAPL', name: 'Apple Inc.', mint: DEVNET_MINTS['xAAPL'].mint, weight: 1428, pythFeedId: '0x49f6b65db1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688', category: 'Consumer Tech' },
      { symbol: 'xMSFT', name: 'Microsoft Corp.', mint: DEVNET_MINTS['xMSFT'].mint, weight: 1428, pythFeedId: '0xd0ca22c317926105f2843efc6291a1a2b2512f4c399738d7f7faea4b1eeea1e1', category: 'Cloud Tech' },
      { symbol: 'xNVDA', name: 'Nvidia Corp.', mint: DEVNET_MINTS['xNVDA'].mint, weight: 1429, pythFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593', category: 'AI & GPUs' },
      { symbol: 'xAMZN', name: 'Amazon.com Inc.', mint: DEVNET_MINTS['xAMZN'].mint, weight: 1428, pythFeedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', category: 'E-Commerce' },
      { symbol: 'xGOOGL', name: 'Alphabet Inc.', mint: DEVNET_MINTS['xGOOGL'].mint, weight: 1429, pythFeedId: '0x5e236fb247854e0cfde86a60d00f68d60ef469614456efb9b5f9037c87c0e5a6', category: 'Hyperscaler' },
      { symbol: 'xMETA', name: 'Meta Platforms Inc.', mint: DEVNET_MINTS['xMETA'].mint, weight: 1429, pythFeedId: '0x7e8346e3e5b328a99db324b13a30c5e933e144a7f0e0f803b96c21e695d38f8f', category: 'Social / AI' },
      { symbol: 'xTSLA', name: 'Tesla Inc.', mint: DEVNET_MINTS['xTSLA'].mint, weight: 1429, pythFeedId: '0x1607a8cb40ff073167a57a55ad7d6f51f496739988b7cb60f1ad9250b73c4d92', category: 'Auto / AI' }
    ]
  },
  {
    id: 'sol-pre-stocks',
    name: 'Pre-IPO Tech Giants',
    ticker: 'PRE-TECH',
    description: 'Pre-market tokenized secondary shares of premier private technology pioneers (OpenAI, SpaceX, Stripe).',
    icon: 'TrendingUp',
    rebalanceIntervalDays: 60,
    assets: [
      { symbol: 'preOPENAI', name: 'OpenAI Pre-Stock', mint: DEVNET_MINTS['preOPENAI']?.mint || 'ANWLjddHcF8qs5N34VxQLRTLAKaLKBKy4x4zXttrtpqF', weight: 4000, pythFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000', category: 'Frontier AI' },
      { symbol: 'preSPACEX', name: 'SpaceX Pre-Stock', mint: DEVNET_MINTS['preSPACEX']?.mint || 'BcHWdywyL3APuSkdGXTNY1rw8aqXDURZbH4Wv6PHoStE', weight: 3500, pythFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000', category: 'Aerospace' },
      { symbol: 'preSTRIPE', name: 'Stripe Pre-Stock', mint: DEVNET_MINTS['preSTRIPE']?.mint || '25y9TFRReWN822h9buyGUTMBAarty2uzDbWwGhN4esqb', weight: 2500, pythFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000', category: 'Global Fintech' }
    ]
  }
];
