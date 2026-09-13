/**
 * Meteora DLMM API Client
 *
 * Provides access to Meteora's Dynamic Liquidity Market Maker (DLMM) pool data:
 * pool search, real-time swap price, TVL, dynamic fee rates, APR, timeframed
 * trading volume & fee history (30m, 1h, 2h, 4h, 12h, 24h), and OHLCV candlestick charts.
 *
 * Base URL: https://dlmm.datapi.meteora.ag
 *
 * @module meteora
 */

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class MeteoraApiError extends Error {
  public status: number;
  public statusText: string;
  public responseData: unknown;

  constructor(
    status: number,
    statusText: string,
    message: string,
    responseData?: unknown,
  ) {
    super(message);
    this.name = "MeteoraApiError";
    this.status = status;
    this.statusText = statusText;
    this.responseData = responseData;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeteoraTokenInfo {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
}

export interface MeteoraMetricsTimeframes {
  "30m"?: number;
  "1h"?: number;
  "2h"?: number;
  "4h"?: number;
  "12h"?: number;
  "24h"?: number;
}

export interface MeteoraPool {
  address: string;
  name: string;
  token_x: MeteoraTokenInfo;
  token_y: MeteoraTokenInfo;
  reserve_x: string | number;
  reserve_y: string | number;
  token_x_amount: number;
  token_y_amount: number;
  created_at?: number;
  dynamic_fee_pct: number;
  tvl: number;
  current_price: number;
  apr: number;
  apy: number;
  has_farm?: boolean;
  farm_apr?: number;
  farm_apy?: number;
  volume?: MeteoraMetricsTimeframes;
  fees?: MeteoraMetricsTimeframes;
  protocol_fees?: MeteoraMetricsTimeframes;
  fee_tvl_ratio?: number;
  is_blacklisted?: boolean;
  tags?: string[];
}

export interface MeteoraPoolSearchResponse {
  data: MeteoraPool[];
  total: number;
  page: number;
  limit: number;
}

export interface MeteoraPoolSearchParams {
  page?: number;
  limit?: number;
  sort_key?: "tvl" | "volume" | "fees" | "apr";
  order_by?: "desc" | "asc";
  search_term?: string;
  include_unknown?: boolean;
  hide_low_tvl?: number;
}

export interface MeteoraOhlcvBar {
  timestamp: number;
  timestamp_str: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MeteoraOhlcvResponse {
  start_time: number;
  end_time: number;
  timeframe: string;
  data: MeteoraOhlcvBar[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Client for the Meteora DLMM Data API.
 *
 * Access pool discovery, liquidity depths, swap prices, trading fees,
 * APR/APY yields, and OHLCV candlestick data across Meteora DLMM pairs.
 */
export class MeteoraClient {
  private readonly baseUrl: string;

  /**
   * Creates an instance of MeteoraClient.
   * @param baseUrl The base URL of the Meteora API (default: `https://dlmm.datapi.meteora.ag`).
   */
  constructor(baseUrl: string = "https://dlmm.datapi.meteora.ag") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /** @internal */
  private async fetchApi<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      throw new Error(`Failed to execute fetch request to ${url}: ${error}`);
    }

    if (!response.ok) {
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        // Not JSON
      }
      throw new MeteoraApiError(
        response.status,
        response.statusText,
        `Meteora API Error: ${response.status} ${response.statusText}`,
        data,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search and list Meteora DLMM pools.
   * @param params Parameters to filter, sort, and paginate the pools.
   * @returns A paginated list of Meteora DLMM pools.
   */
  public async searchPools(
    params?: MeteoraPoolSearchParams,
  ): Promise<MeteoraPoolSearchResponse> {
    const queryParams = new URLSearchParams();

    if (params) {
      if (params.page !== undefined)
        queryParams.append("page", params.page.toString());
      if (params.limit !== undefined)
        queryParams.append("limit", params.limit.toString());
      if (params.sort_key !== undefined)
        queryParams.append("sort_key", params.sort_key);
      if (params.order_by !== undefined)
        queryParams.append("order_by", params.order_by);
      if (params.search_term !== undefined)
        queryParams.append("search_term", params.search_term);
      if (params.include_unknown !== undefined)
        queryParams.append(
          "include_unknown",
          params.include_unknown.toString(),
        );
      if (params.hide_low_tvl !== undefined)
        queryParams.append("hide_low_tvl", params.hide_low_tvl.toString());
    }

    const queryString = queryParams.toString();
    const endpoint = queryString ? `/pools?${queryString}` : "/pools";

    return this.fetchApi<MeteoraPoolSearchResponse>(endpoint);
  }

  /**
   * Convenience method to search for pools containing a specific SPL token mint.
   * @param mintAddress The token mint address to search for.
   * @returns A paginated list of matching Meteora pools.
   */
  public async searchByMint(
    mintAddress: string,
  ): Promise<MeteoraPoolSearchResponse> {
    return this.searchPools({ search_term: mintAddress });
  }

  /**
   * Get detailed information and metrics for a specific pool.
   * @param address The on-chain address of the Meteora DLMM pool.
   * @returns Details of the specified Meteora pool.
   */
  public async getPool(address: string): Promise<MeteoraPool> {
    return this.fetchApi<MeteoraPool>(`/pools/${address}`);
  }

  /**
   * Convenience method to get the current pool swap price.
   * @param poolAddress The on-chain address of the Meteora DLMM pool.
   * @returns The current price (Token X denominated in Token Y).
   */
  public async getPoolPrice(poolAddress: string): Promise<number> {
    const pool = await this.getPool(poolAddress);
    return pool.current_price;
  }

  /**
   * Get pool TVL, fees, APR and volume summary.
   * @param poolAddress The on-chain address of the Meteora DLMM pool.
   */
  public async getPoolMetrics(poolAddress: string): Promise<{
    tvl: number;
    apr: number;
    apy: number;
    fee24h: number | null;
    volume24h: number | null;
    currentPrice: number;
  }> {
    const pool = await this.getPool(poolAddress);
    return {
      tvl: pool.tvl,
      apr: pool.apr,
      apy: pool.apy,
      fee24h: pool.fees?.["24h"] ?? null,
      volume24h: pool.volume?.["24h"] ?? null,
      currentPrice: pool.current_price,
    };
  }

  /**
   * Get OHLCV candlestick and volume history data for a specific pool.
   * @param address The on-chain address of the Meteora DLMM pool.
   * @param resolution Resolution interval in minutes or time strings (default: 60).
   * @returns MeteoraOhlcvResponse containing historical price candles and volume.
   */
  public async getPoolOhlcv(
    address: string,
    resolution: string | number = 60,
  ): Promise<MeteoraOhlcvResponse> {
    return this.fetchApi<MeteoraOhlcvResponse>(
      `/pools/${address}/ohlcv?resolution=${resolution}`,
    );
  }
}
