/**
 * Pyth Network Oracle & xStocks Reference Pricing Client
 *
 * Provides:
 * 1. XSTOCKS_PYTH_FEEDS — Confirmed Pyth price feed IDs for xStocks (AAPLx, TSLAx, NVDAx, SPYx, MSFTx)
 *    and underlying equity reference price feeds.
 * 2. PythHermesClient — Off-chain REST client for Pyth Hermes feed search and metadata.
 * 3. PythSolanaClient — On-chain Pyth price account reader via Solana RPC connection.
 * 4. fetchXStocksOracles — xStocks platform `/public/oracles` integration for reference pricing.
 *
 * @module pyth-oracle
 */

import { Connection, PublicKey } from '@solana/web3.js';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PythOracleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PythOracleError';
    Object.setPrototypeOf(this, PythOracleError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PythPriceData {
  /** The 0x-prefixed Pyth feed ID */
  feedId: string;
  /** Human-readable USD price computed as rawPrice × 10^expo */
  price: number;
  /** Confidence interval in USD */
  confidence: number;
  /** Price exponent (e.g. -8) */
  expo: number;
  /** Raw integer price from oracle */
  rawPrice: string;
  /** Raw confidence integer */
  rawConfidence: string;
  /** Unix timestamp of publication */
  publishTime: number;
  /** Feed status */
  status: 'trading' | 'halted' | 'unknown';
}

export interface PythFeedInfo {
  id: string;
  market_hours?: {
    is_open: boolean;
    next_open?: number | null;
    next_close?: number | null;
  };
  attributes: Record<string, string>;
}

export interface XStocksOracleInfo {
  symbol: string;
  name?: string;
  mint?: string;
  oracleAddress?: string;
  oracleType?: 'pyth' | 'switchboard';
  feedId?: string;
  price?: number;
  lastUpdated?: number;
  maxStalenessSeconds?: number;
  confidenceThresholdPct?: number;
}

// ---------------------------------------------------------------------------
// Pyth Feed ID Registry for xStocks & Equity Reference
// ---------------------------------------------------------------------------

export interface StockFeedDefinition {
  symbol: string;
  name: string;
  xStockFeedId: string;
  equityReferenceFeedId: string;
}

/**
 * Built-in registry mapping tokenized equity symbols (xStocks) to both their
 * specific xStock Pyth feed ID and their official stock equity reference feed ID.
 */
export const XSTOCKS_PYTH_FEEDS: Record<string, StockFeedDefinition> = {
  NVDA: {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    xStockFeedId: '0x4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f', // Crypto.NVDAX/USD
    equityReferenceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593', // Equity.US.NVDA/USD
  },
  AAPL: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    xStockFeedId: '0x978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675', // Crypto.AAPLX/USD
    equityReferenceFeedId: '0x49f6b65db1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688', // Equity.US.AAPL/USD
  },
  TSLA: {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    xStockFeedId: '0x47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362', // Crypto.TSLAX/USD
    equityReferenceFeedId: '0x1607a8cb40ff073167a57a55ad7d6f51f496739988b7cb60f1ad9250b73c4d92', // Equity.US.TSLA/USD
  },
  SPY: {
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    xStockFeedId: '0x2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14', // Crypto.SPYX/USD
    equityReferenceFeedId: '0x2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14',
  },
  MSFT: {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    xStockFeedId: '0xbb723a70af731ab56b9a650eb7e8ac22b7bc07ea77f8670bd1fa9a37bf6df3f5', // Crypto.MSFTX/USD
    equityReferenceFeedId: '0xd0ca22c317926105f2843efc6291a1a2b2512f4c399738d7f7faea4b1eeea1e1', // Equity.US.MSFT/USD
  },
  AMZN: {
    symbol: 'AMZN',
    name: 'Amazon.com, Inc.',
    xStockFeedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    equityReferenceFeedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  },
  GOOGL: {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    xStockFeedId: '0x5e236fb247854e0cfde86a60d00f68d60ef469614456efb9b5f9037c87c0e5a6',
    equityReferenceFeedId: '0x5e236fb247854e0cfde86a60d00f68d60ef469614456efb9b5f9037c87c0e5a6',
  },
  META: {
    symbol: 'META',
    name: 'Meta Platforms, Inc.',
    xStockFeedId: '0x7e8346e3e5b328a99db324b13a30c5e933e144a7f0e0f803b96c21e695d38f8f',
    equityReferenceFeedId: '0x7e8346e3e5b328a99db324b13a30c5e933e144a7f0e0f803b96c21e695d38f8f',
  }
};

/**
 * Normalizes a stock symbol (e.g. 'xAAPL', 'AAPLx', 'preOPENAI' -> 'AAPL', 'OPENAI').
 */
export function normalizeSymbol(symbol: string): string {
  return symbol
    .trim()
    .replace(/^x/i, '')
    .replace(/x$/i, '')
    .replace(/^pre/i, '')
    .toUpperCase();
}

/**
 * Resolves a symbol to its Pyth feed configuration.
 */
export function getStockFeedDefinition(symbol: string): StockFeedDefinition | null {
  const norm = normalizeSymbol(symbol);
  return XSTOCKS_PYTH_FEEDS[norm] || null;
}

/**
 * Returns all supported tokenized stock feed definitions.
 */
export function listSupportedEquities(): StockFeedDefinition[] {
  return Object.values(XSTOCKS_PYTH_FEEDS);
}

// ---------------------------------------------------------------------------
// Pyth Hermes REST Client (Metadata & Search)
// ---------------------------------------------------------------------------

export class PythHermesClient {
  public readonly baseUrl: string;

  constructor(baseUrl: string = 'https://hermes.pyth.network') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Search for Pyth price feeds by symbol or query string.
   */
  async searchFeeds(query: string, assetType?: string): Promise<PythFeedInfo[]> {
    try {
      const url = new URL(`${this.baseUrl}/v2/price_feeds`);
      url.searchParams.append('query', query);
      if (assetType) {
        url.searchParams.append('asset_type', assetType);
      }

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new PythOracleError(`Hermes API search error: ${res.status} ${res.statusText}`);
      }

      return res.json() as Promise<PythFeedInfo[]>;
    } catch (err) {
      if (err instanceof PythOracleError) throw err;
      throw new PythOracleError(`Failed to search Pyth feeds: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Look up Pyth feed details for an xStock symbol.
   */
  async getFeedDetails(symbol: string): Promise<PythFeedInfo | null> {
    const norm = normalizeSymbol(symbol);
    const feeds = await this.searchFeeds(`${norm}X`);
    return feeds[0] || null;
  }
}

// ---------------------------------------------------------------------------
// On-Chain Pyth Solana Client
// ---------------------------------------------------------------------------

/** Pyth Solana Receiver Program ID */
export const PYTH_RECEIVER_PROGRAM_ID = new PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ');

/**
 * On-chain reader for Pyth oracle feeds on Solana.
 * Reads long-lived price feed accounts directly using Solana RPC Connection.
 */
export class PythSolanaClient {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Derives the PDA address for a Pyth long-lived price feed account.
   * Seeds: [shard_id (2-byte le), feed_id (32 bytes)] against Receiver Program.
   */
  getPriceFeedAccountAddress(shardId: number, feedIdHex: string): PublicKey {
    const cleanHex = feedIdHex.replace(/^0x/, '');
    const feedIdBuffer = Buffer.from(cleanHex, 'hex');
    const shardBuffer = Buffer.alloc(2);
    shardBuffer.writeUInt16LE(shardId);

    const [pubkey] = PublicKey.findProgramAddressSync(
      [shardBuffer, feedIdBuffer],
      PYTH_RECEIVER_PROGRAM_ID
    );
    return pubkey;
  }

  /**
   * Reads and parses a Pyth price feed account from the Solana blockchain.
   */
  async getOnChainPrice(shardId: number, feedIdHex: string): Promise<PythPriceData | null> {
    try {
      const pda = this.getPriceFeedAccountAddress(shardId, feedIdHex);
      const accountInfo = await this.connection.getAccountInfo(pda);
      if (!accountInfo || !accountInfo.data || accountInfo.data.length < 64) {
        return null;
      }

      // Pyth PriceFeed account binary layout:
      // Offset 8: header / discriminator
      // PriceMessage starts with feedId (32 bytes), price (i64), conf (u64), exponent (i32), publishTime (i64)
      const data = accountInfo.data;
      const priceOffset = 8 + 32; // after 8-byte discriminator + 32-byte feedId
      if (data.length < priceOffset + 24) return null;

      const rawPriceBigInt = data.readBigInt64LE(priceOffset);
      const rawConfBigInt = data.readBigUInt64LE(priceOffset + 8);
      const expo = data.readInt32LE(priceOffset + 16);
      const publishTimeBigInt = data.readBigInt64LE(priceOffset + 20);

      const factor = Math.pow(10, expo);
      const price = Number(rawPriceBigInt) * factor;
      const confidence = Number(rawConfBigInt) * factor;

      return {
        feedId: feedIdHex.startsWith('0x') ? feedIdHex : `0x${feedIdHex}`,
        price,
        confidence,
        expo,
        rawPrice: rawPriceBigInt.toString(),
        rawConfidence: rawConfBigInt.toString(),
        publishTime: Number(publishTimeBigInt),
        status: 'trading',
      };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// xStocks `/public/oracles` Route Integration
// ---------------------------------------------------------------------------

/**
 * Known endpoints for xStocks / Backed Finance oracle configuration route.
 */
const XSTOCKS_ORACLE_URLS = [
  'https://api.xstocks.fi/public/oracles',
  'https://xstocks.fi/api/public/oracles',
  'https://app.xstocks.fi/api/public/oracles',
];

/**
 * Fetches the reference oracle registry from xStocks `/public/oracles` route.
 * Pair this with Pyth Network feeds when you need reference pricing for
 * tokenized equities (AAPLx, TSLAx, NVDAx, SPYx).
 *
 * If the remote route is unreachable, returns fallback entries from the built-in
 * XSTOCKS_PYTH_FEEDS registry.
 *
 * @param customUrl Optional custom API URL to override the default endpoints.
 * @returns Array of XStocksOracleInfo records.
 */
export async function fetchXStocksOracles(customUrl?: string): Promise<XStocksOracleInfo[]> {
  const endpoints = customUrl ? [customUrl] : XSTOCKS_ORACLE_URLS;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.oracles)) return data.oracles;
      }
    } catch {
      // Try next endpoint
    }
  }

  // Graceful fallback to built-in xStocks registry
  return Object.values(XSTOCKS_PYTH_FEEDS).map((stock) => ({
    symbol: `${stock.symbol}x`,
    name: stock.name,
    oracleType: 'pyth',
    feedId: stock.xStockFeedId,
    maxStalenessSeconds: 60,
    confidenceThresholdPct: 0.5,
  }));
}
