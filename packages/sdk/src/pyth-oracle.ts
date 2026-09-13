/**
 * Pyth Network Oracle & xStocks Reference Pricing Client
 *
 * Provides:
 * 1. XSTOCKS_PYTH_FEEDS — Pyth feed identities verified against Hermes metadata on 2026-09-13
 *    and underlying equity reference price feeds.
 * 2. PythHermesClient — Off-chain REST client for Pyth Hermes feed search and metadata.
 * 3. PythSolanaClient — On-chain Pyth price account reader via Solana RPC connection.
 * 4. fetchXStocksOracles — explicitly configured issuer oracle metadata adapter.
 *
 * @module pyth-oracle
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PythOracleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PythOracleError";
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
  status: "trading" | "halted" | "unknown";
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
  oracleType?: "pyth" | "switchboard";
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
 * token feed and underlying equity feed. Verified from /v2/price_feeds on
 * 2026-09-13. These identities do not establish current price availability,
 * mint identity or corporate-action scaling; never substitute the equity feed
 * for a token execution price.
 */
export const XSTOCKS_PYTH_FEEDS: Record<string, StockFeedDefinition> = {
  NVDA: {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    xStockFeedId:
      "0x4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f", // Crypto.NVDAX/USD
    equityReferenceFeedId:
      "0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593", // Equity.US.NVDA/USD
  },
  AAPL: {
    symbol: "AAPL",
    name: "Apple Inc.",
    xStockFeedId:
      "0x978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675", // Crypto.AAPLX/USD
    equityReferenceFeedId:
      "0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688", // Equity.US.AAPL/USD
  },
  TSLA: {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    xStockFeedId:
      "0x47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362", // Crypto.TSLAX/USD
    equityReferenceFeedId:
      "0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1", // Equity.US.TSLA/USD
  },
  SPY: {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    xStockFeedId:
      "0x2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14", // Crypto.SPYX/USD
    equityReferenceFeedId:
      "0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
  },
  MSFT: {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    xStockFeedId:
      "0xbb723a70af731ab56b9a650eb7e8ac22b7bc07ea77f8670bd1fa9a37bf6df3f5", // Crypto.MSFTX/USD
    equityReferenceFeedId:
      "0xd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1", // Equity.US.MSFT/USD
  },
  AMZN: {
    symbol: "AMZN",
    name: "Amazon.com, Inc.",
    xStockFeedId:
      "0x7148fbe6e493ff2580305c92a8d7f8628c9943b11b9b253aebc24863fec290e8",
    equityReferenceFeedId:
      "0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
  },
  GOOGL: {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    xStockFeedId:
      "0xb911b0329028cd0283e4259c33809d62942bd2716a58084e5f31d64c00b5424e",
    equityReferenceFeedId:
      "0x5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6",
  },
  META: {
    symbol: "META",
    name: "Meta Platforms, Inc.",
    xStockFeedId:
      "0xbf3e5871be3f80ab7a4d1f1fd039145179fb58569e159aee1ccd472868ea5900",
    equityReferenceFeedId:
      "0x78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe",
  },
};

/**
 * Normalizes a stock symbol (e.g. 'xAAPL', 'AAPLx', 'preOPENAI' -> 'AAPL', 'OPENAI').
 */
export function normalizeSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  const upper = trimmed.toUpperCase();
  if (XSTOCKS_PYTH_FEEDS[upper]) return upper;
  for (const candidate of [upper.replace(/^X/, ""), upper.replace(/X$/, "")])
    if (XSTOCKS_PYTH_FEEDS[candidate]) return candidate;
  // Only explicit lowercase token decorations are removed for unknown symbols.
  // XOM and NFLX are genuine equity symbols, not prefixes/suffixes to strip.
  return trimmed
    .replace(/^pre(?=[A-Z])/, "")
    .replace(/^x(?=[A-Z])/, "")
    .replace(/x$/, "")
    .toUpperCase();
}

/**
 * Resolves a symbol to its Pyth feed configuration.
 */
export function getStockFeedDefinition(
  symbol: string,
): StockFeedDefinition | null {
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

  constructor(baseUrl: string = "https://hermes.pyth.network") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Search for Pyth price feeds by symbol or query string.
   */
  async searchFeeds(
    query: string,
    assetType?: string,
  ): Promise<PythFeedInfo[]> {
    try {
      const url = new URL(`${this.baseUrl}/v2/price_feeds`);
      url.searchParams.append("query", query);
      if (assetType) {
        url.searchParams.append("asset_type", assetType);
      }

      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new PythOracleError(
          `Hermes API search error: ${res.status} ${res.statusText}`,
        );
      }

      const payload: unknown = await res.json();
      if (!Array.isArray(payload))
        throw new PythOracleError("Hermes returned invalid feed metadata.");
      return payload.filter((feed): feed is PythFeedInfo =>
        Boolean(
          feed &&
          typeof feed === "object" &&
          typeof feed.id === "string" &&
          /^(0x)?[a-fA-F0-9]{64}$/.test(feed.id) &&
          feed.attributes &&
          typeof feed.attributes === "object" &&
          typeof feed.attributes.symbol === "string",
        ),
      );
    } catch (err) {
      if (err instanceof PythOracleError) throw err;
      throw new PythOracleError("Failed to search Pyth feeds.");
    }
  }

  /**
   * Look up Pyth feed details for an xStock symbol.
   */
  async getFeedDetails(symbol: string): Promise<PythFeedInfo | null> {
    const norm = normalizeSymbol(symbol);
    const feeds = await this.searchFeeds(`${norm}X`);
    return (
      feeds.find((feed) => feed.attributes?.symbol === `Crypto.${norm}X/USD`) ??
      null
    );
  }
}

// ---------------------------------------------------------------------------
// On-Chain Pyth Solana Client
// ---------------------------------------------------------------------------

/** Pyth Solana Receiver Program ID */
export const PYTH_RECEIVER_PROGRAM_ID = new PublicKey(
  "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
);
export const PYTH_PUSH_ORACLE_PROGRAM_ID = new PublicKey(
  "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT",
);

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
   * Seeds: [shard_id (2-byte le), feed_id (32 bytes)] against the Push Oracle program (the account owner remains Receiver).
   */
  getPriceFeedAccountAddress(shardId: number, feedIdHex: string): PublicKey {
    if (
      !Number.isInteger(shardId) ||
      shardId < 0 ||
      shardId > 65535 ||
      !/^(0x)?[a-fA-F0-9]{64}$/.test(feedIdHex)
    )
      throw new PythOracleError(
        "A u16 shard and 32-byte hex feed ID are required.",
      );
    const cleanHex = feedIdHex.replace(/^0x/, "");
    const feedIdBuffer = Buffer.from(cleanHex, "hex");
    const shardBuffer = Buffer.alloc(2);
    shardBuffer.writeUInt16LE(shardId);

    const [pubkey] = PublicKey.findProgramAddressSync(
      [shardBuffer, feedIdBuffer],
      PYTH_PUSH_ORACLE_PROGRAM_ID,
    );
    return pubkey;
  }

  /**
   * Reads and parses a Pyth price feed account from the Solana blockchain.
   */
  async getOnChainPrice(
    shardId: number,
    feedIdHex: string,
  ): Promise<PythPriceData | null> {
    try {
      const pda = this.getPriceFeedAccountAddress(shardId, feedIdHex);
      const accountInfo = await this.connection.getAccountInfo(pda);
      if (
        !accountInfo ||
        !accountInfo.owner.equals(PYTH_RECEIVER_PROGRAM_ID) ||
        accountInfo.executable
      )
        return null;
      const data = accountInfo.data;
      // Anchor PriceUpdateV2: discriminator + write_authority + Full enum tag
      // + PriceFeedMessage + posted_slot. Partial updates are never accepted.
      if (
        data.length < 133 ||
        !data
          .subarray(0, 8)
          .equals(Buffer.from([34, 241, 35, 99, 157, 126, 244, 205])) ||
        data[40] !== 1
      )
        return null;
      const cleanHex = feedIdHex.replace(/^0x/, "").toLowerCase();
      if (data.subarray(41, 73).toString("hex") !== cleanHex) return null;
      const priceOffset = 73;
      const rawPriceBigInt = data.readBigInt64LE(priceOffset);
      const rawConfBigInt = data.readBigUInt64LE(priceOffset + 8);
      const expo = data.readInt32LE(priceOffset + 16);
      const publishTimeBigInt = data.readBigInt64LE(priceOffset + 20);
      const publishTime = Number(publishTimeBigInt);
      const age = Date.now() / 1000 - publishTime;
      const factor = Math.pow(10, expo);
      const price = Number(rawPriceBigInt) * factor;
      const confidence = Number(rawConfBigInt) * factor;
      if (
        !Number.isSafeInteger(publishTime) ||
        age < -30 ||
        age > 60 ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isFinite(confidence)
      )
        return null;

      return {
        feedId: feedIdHex.startsWith("0x") ? feedIdHex : `0x${feedIdHex}`,
        price,
        confidence,
        expo,
        rawPrice: rawPriceBigInt.toString(),
        rawConfidence: rawConfBigInt.toString(),
        publishTime: Number(publishTimeBigInt),
        status: "unknown", // A fresh price does not establish market trading hours.
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
 * Read an explicitly configured issuer oracle endpoint. No default endpoint has
 * been verified for this legacy adapter; absence/failure returns no observations.
 * Static Pyth identities must not masquerade as a live issuer oracle registry.
 */
export async function fetchXStocksOracles(
  customUrl?: string,
): Promise<XStocksOracleInfo[]> {
  if (!customUrl) return [];
  try {
    const url = new URL(customUrl);
    if (url.protocol !== "https:" || url.username || url.password) return [];
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    const records = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && "oracles" in payload
        ? payload.oracles
        : null;
    if (!Array.isArray(records)) return [];
    return records.filter((item): item is XStocksOracleInfo =>
      Boolean(
        item &&
        typeof item === "object" &&
        typeof item.symbol === "string" &&
        (item.feedId === undefined ||
          /^(0x)?[a-fA-F0-9]{64}$/.test(item.feedId)) &&
        (item.price === undefined ||
          (typeof item.price === "number" &&
            Number.isFinite(item.price) &&
            item.price > 0)),
      ),
    );
  } catch {
    return [];
  }
}
