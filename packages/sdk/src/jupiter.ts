/**
 * Jupiter Price API v3 & v2 Client
 *
 * Provides on-chain last-swap USD pricing for any SPL token via Jupiter's
 * aggregator price oracle. Supports batch queries (up to 50 mints),
 * liquidity metrics, price change 24h, and token decimals.
 *
 * Default Base URL: https://api.jup.ag/price/v3
 * Docs: https://station.jup.ag/docs/apis/price-api
 *
 * NOTE: As per market best practice for tokenized equities:
 * Good for on-chain last-swap USD pricing. Don't treat it as the official
 * stock print — it reflects the latest decentralized exchange swap price,
 * not a regulated exchange quote.
 *
 * @module jupiter
 */

// ---------------------------------------------------------------------------
// Types - Jupiter Price v3
// ---------------------------------------------------------------------------

/**
 * Token price data returned by Jupiter Price API v3.
 */
export interface JupiterPriceV3Data {
  /** Timestamp when the price was indexed */
  createdAt?: string;
  /** Available liquidity depth in USD across Solana DEXs */
  liquidity?: number;
  /** Last-swapped USD price of the token */
  usdPrice: number;
  /** Solana block ID where the price was derived */
  blockId?: number;
  /** SPL token decimals */
  decimals?: number;
  /** 24-hour price change percentage */
  priceChange24h?: number;
}

/**
 * Key-value mapping of token mint address to Jupiter v3 price data.
 */
export type JupiterPriceV3Response = Record<string, JupiterPriceV3Data>;

// ---------------------------------------------------------------------------
// Types - Jupiter Price v2 (Legacy support)
// ---------------------------------------------------------------------------

export interface JupiterPriceV2Response {
  data: Record<string, JupiterTokenPriceV2 | null>;
  timeTaken?: number;
}

export interface JupiterTokenPriceV2 {
  id: string;
  type: string;
  price: string;
  extraInfo?: JupiterExtraInfo;
}

export interface JupiterExtraInfo {
  lastSwappedPrice?: {
    lastJupiterSellAt?: number;
    lastJupiterSellPrice?: string;
    lastJupiterBuyAt?: number;
    lastJupiterBuyPrice?: string;
  };
  quotedPrice?: {
    buyPrice: string;
    buyAt: number;
    sellPrice: string;
    sellAt: number;
  };
  confidenceLevel: "high" | "medium" | "low";
  depth?: {
    buyPriceImpactRatio: {
      depth: Record<string, number>;
      timestamp: number;
    };
    sellPriceImpactRatio: {
      depth: Record<string, number>;
      timestamp: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class JupiterPriceApiError extends Error {
  public statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "JupiterPriceApiError";
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Client Options
// ---------------------------------------------------------------------------

export interface JupiterPriceClientOptions {
  /** Override the base URL (default: `https://api.jup.ag/price/v3`). */
  baseUrl?: string;
  /** Optional Jupiter Developer Portal API key for higher rate limits. */
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Client for Jupiter's Price API.
 *
 * Supports both Jupiter Price v3 (latest standard) and v2.
 * Good for on-chain last-swap USD pricing of any SPL token routed through Jupiter.
 *
 * Features:
 * - Batch queries (auto-chunked into batches of 100)
 * - 24h price change and liquidity metadata
 * - Rate limit handling (HTTP 429)
 * - Helper methods for formatted price displays
 */
export class JupiterPriceClient {
  private baseUrl: string;
  private apiKey?: string;

  /**
   * Creates an instance of JupiterPriceClient.
   * @param options Client configuration options.
   */
  constructor(options?: JupiterPriceClientOptions) {
    this.baseUrl = (options?.baseUrl || "https://api.jup.ag/price/v3").replace(
      /\/$/,
      "",
    );
    this.apiKey = options?.apiKey;
  }

  /**
   * Formats a high-precision price number or string to a fixed number of decimals.
   * @param price Price as number or string.
   * @param decimals Optional number of decimal places (default: 2 for >= 1, 4 for < 1).
   * @returns Formatted price string.
   */
  static formatPrice(price: number | string, decimals?: number): string {
    const num = typeof price === "number" ? price : parseFloat(price);
    if (isNaN(num)) return String(price);
    if (decimals !== undefined) {
      return num.toFixed(decimals);
    }
    return num >= 1 ? num.toFixed(2) : num.toFixed(4);
  }

  /** @internal */
  private async fetchFromApi<T>(endpoint: string): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new JupiterPriceApiError(
          "Rate limit exceeded (429). Slow down requests or use a Jupiter Developer Portal API key.",
          429,
        );
      }
      throw new JupiterPriceApiError(
        `API request failed with status: ${response.status}`,
        response.status,
      );
    }

    return response.json() as Promise<T>;
  }

  /** @internal */
  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Gets the last-swap USD price of a single token.
   * @param mint The token mint address.
   * @returns The parsed float USD price, or null if token has no Jupiter liquidity.
   */
  async getPrice(mint: string): Promise<number | null> {
    const prices = await this.getPrices([mint]);
    return prices[mint] ?? null;
  }

  /**
   * Gets detailed price metadata for a single token (price, liquidity, 24h change).
   * @param mint The token mint address.
   * @returns JupiterPriceV3Data object or null if not found.
   */
  async getTokenPriceInfo(mint: string): Promise<JupiterPriceV3Data | null> {
    const data = await this.getPricesWithDetails([mint]);
    return data[mint] ?? null;
  }

  /**
   * Gets last-swap USD prices for multiple tokens in batches of up to 50.
   * @param mints Array of token mint addresses.
   * @returns A map of mint address → parsed USD price (only includes found tokens).
   */
  async getPrices(mints: string[]): Promise<Record<string, number>> {
    const details = await this.getPricesWithDetails(mints);
    const results: Record<string, number> = {};

    for (const [mint, info] of Object.entries(details)) {
      if (
        info &&
        typeof info.usdPrice === "number" &&
        Number.isFinite(info.usdPrice) &&
        info.usdPrice > 0
      ) {
        results[mint] = info.usdPrice;
      }
    }

    return results;
  }

  /**
   * Gets full price data with liquidity, decimals, and 24h change for multiple tokens.
   * Automatically splits requests into chunks of 50 mints.
   * @param mints Array of token mint addresses.
   * @returns A map of mint address → JupiterPriceV3Data.
   */
  async getPricesWithDetails(
    mints: string[],
  ): Promise<Record<string, JupiterPriceV3Data>> {
    const results: Record<string, JupiterPriceV3Data> = {};
    if (mints.length === 0) return results;

    const chunks = this.chunkArray(mints, 50);

    for (const chunk of chunks) {
      const endpoint = `?ids=${chunk.join(",")}`;
      const json = await this.fetchFromApi<Record<string, unknown>>(endpoint);

      // Support v3 format: { [mint]: { usdPrice, liquidity, decimals, priceChange24h } }
      // Also supports v2 format: { data: { [mint]: { price, ... } } }
      if (json.data && typeof json.data === "object") {
        const v2Data = (json as unknown as JupiterPriceV2Response).data;
        for (const [id, item] of Object.entries(v2Data)) {
          if (
            chunk.includes(id) &&
            item &&
            typeof item.price === "string" &&
            Number.isFinite(Number(item.price)) &&
            Number(item.price) > 0
          ) {
            results[id] = {
              usdPrice: Number(item.price),
            };
          }
        }
      } else {
        for (const [id, item] of Object.entries(json)) {
          if (
            chunk.includes(id) &&
            item &&
            typeof item === "object" &&
            "usdPrice" in item &&
            typeof item.usdPrice === "number" &&
            Number.isFinite(item.usdPrice) &&
            item.usdPrice > 0
          ) {
            results[id] = item as JupiterPriceV3Data;
          }
        }
      }
    }

    return results;
  }
}
