import { ThematicBasket } from './types';
import { DEVNET_MINTS } from './constants/devnet-mints';

export const CURATED_BASKETS: ThematicBasket[] = [
  {
    id: 'sol-mag7',
    name: 'Magnificent 7 Tech',
    ticker: 'MAG7',
    description: 'Equal-weighted exposure to Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta, and Tesla.',
    icon: '⚡',
    rebalanceIntervalDays: 30,
    assets: [
      { symbol: 'xAAPL', name: 'Apple Inc.', mint: DEVNET_MINTS['xAAPL'].mint, weight: 1428, pythFeedId: '0x49f6b65db1de8ab7a264a4a6e5a67678994363dbab12932b82772e73e1622548', category: 'Tech' },
      { symbol: 'xMSFT', name: 'Microsoft Corp.', mint: DEVNET_MINTS['xMSFT'].mint, weight: 1428, pythFeedId: '0xd0ca22c317926105f2843efc6291a1a2b2512f4c399738d7f7faea4b1eeea1e1', category: 'Tech' },
      { symbol: 'xNVDA', name: 'Nvidia Corp.', mint: DEVNET_MINTS['xNVDA'].mint, weight: 1429, pythFeedId: '0xa412ea6eb7ecf265fb26079979cc3cf78183069c9b1f2ebff1562b8a7862c161', category: 'AI' },
      { symbol: 'xAMZN', name: 'Amazon.com Inc.', mint: DEVNET_MINTS['xAMZN'].mint, weight: 1428, pythFeedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', category: 'Consumer Tech' },
      { symbol: 'xGOOGL', name: 'Alphabet Inc.', mint: DEVNET_MINTS['xGOOGL'].mint, weight: 1429, pythFeedId: '0x5e236fb247854e0cfde86a60d00f68d60ef469614456efb9b5f9037c87c0e5a6', category: 'Tech' },
      { symbol: 'xMETA', name: 'Meta Platforms Inc.', mint: DEVNET_MINTS['xMETA'].mint, weight: 1429, pythFeedId: '0x7e8346e3e5b328a99db324b13a30c5e933e144a7f0e0f803b96c21e695d38f8f', category: 'Social / AI' },
      { symbol: 'xTSLA', name: 'Tesla Inc.', mint: DEVNET_MINTS['xTSLA'].mint, weight: 1429, pythFeedId: '0x1607a8cb40ff073167a57a55ad7d6f51f496739988b7cb60f1ad9250b73c4d92', category: 'Auto / AI' }
    ]
  },
  {
    id: 'sol-ai-infra',
    name: 'AI & Semiconductor Leaders',
    ticker: 'AI-LEADERS',
    description: 'Concentrated exposure to the premier AI compute, cloud, and foundational infrastructure builders.',
    icon: '🤖',
    rebalanceIntervalDays: 30,
    assets: [
      { symbol: 'xNVDA', name: 'Nvidia Corp.', mint: DEVNET_MINTS['xNVDA'].mint, weight: 4000, pythFeedId: '0xa412ea6eb7ecf265fb26079979cc3cf78183069c9b1f2ebff1562b8a7862c161', category: 'Semiconductors' },
      { symbol: 'xMSFT', name: 'Microsoft Corp.', mint: DEVNET_MINTS['xMSFT'].mint, weight: 3000, pythFeedId: '0xd0ca22c317926105f2843efc6291a1a2b2512f4c399738d7f7faea4b1eeea1e1', category: 'Cloud AI' },
      { symbol: 'xGOOGL', name: 'Alphabet Inc.', mint: DEVNET_MINTS['xGOOGL'].mint, weight: 3000, pythFeedId: '0x5e236fb247854e0cfde86a60d00f68d60ef469614456efb9b5f9037c87c0e5a6', category: 'Hyperscaler' }
    ]
  },
  {
    id: 'sol-pre-stocks',
    name: 'Pre-IPO Tech Giants',
    ticker: 'PRE-TECH',
    description: 'Pre-market tokenized secondary shares of top private technology pioneers (OpenAI, SpaceX, Stripe).',
    icon: '🚀',
    rebalanceIntervalDays: 60,
    assets: [
      { symbol: 'preOPENAI', name: 'OpenAI Pre-Stock', mint: DEVNET_MINTS['preOPENAI'].mint, weight: 4000, pythFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000', category: 'Private AI' },
      { symbol: 'preSPACEX', name: 'SpaceX Pre-Stock', mint: DEVNET_MINTS['preSPACEX'].mint, weight: 3500, pythFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000', category: 'Aerospace' },
      { symbol: 'preSTRIPE', name: 'Stripe Pre-Stock', mint: DEVNET_MINTS['preSTRIPE'].mint, weight: 2500, pythFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000', category: 'Fintech' }
    ]
  }
];
