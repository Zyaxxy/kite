import type { BasketPerformance, BasketTimeframe, MarketBasket } from "@kite/sdk";
import type { BasketDisplay } from "./MarketUI";

interface CacheEntry {
  performance: BasketPerformance;
  expiresAt: number;
}

class BasketPerformanceClient {
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<BasketPerformance>>();
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private maxConcurrent = 2;
  private listeners = new Set<() => void>();

  private makeKey(basketId: string, timeframe: BasketTimeframe, amount = 1000): string {
    return `${basketId}:${timeframe}:${amount}`;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.activeCount++;
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.activeCount--;
          this.next();
        }
      };

      if (this.activeCount < this.maxConcurrent) {
        void execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private next() {
    if (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) void nextTask();
    }
  }

  peek(basketId: string, timeframe: BasketTimeframe = "30d", amount = 1000): BasketPerformance | null {
    const key = this.makeKey(basketId, timeframe, amount);
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.performance;
    }
    return null;
  }

  async load(
    basket: BasketDisplay | MarketBasket | { id: string; name?: string; assets: any[]; isCustom?: boolean },
    timeframe: BasketTimeframe = "30d",
    amount = 1000,
    signal?: AbortSignal,
  ): Promise<BasketPerformance> {
    const basketId = basket.id;
    const key = this.makeKey(basketId, timeframe, amount);

    const cached = this.peek(basketId, timeframe, amount);
    if (cached) return cached;

    const existingPromise = this.inFlight.get(key);
    if (existingPromise) return existingPromise;

    const operation = this.enqueue(async () => {
      try {
        const params = new URLSearchParams({
          id: basketId,
          timeframe,
          amount: String(amount),
        });

        // If user-created custom basket, supply allocation symbols to the server
        if ((basket as any).isCustom) {
          const rawAssets: any[] = (basket as any).source?.assets ?? (basket as any).assets ?? [];
          const allocStrings: string[] = [];
          for (const item of rawAssets) {
            const asset = item.asset ?? item;
            const sym = asset.underlyingSymbol || asset.symbol;
            const weight = item.weight || Math.round(10000 / rawAssets.length);
            if (sym) allocStrings.push(`${sym}:${weight}`);
          }
          if (allocStrings.length > 0) {
            params.set("allocations", allocStrings.join(","));
            if ((basket as any).name) {
              params.set("name", (basket as any).name);
            }
          }
        }

        const res = await fetch(`/api/baskets/performance?${params.toString()}`, {
          signal: signal ?? AbortSignal.timeout(8_000),
        });

        if (!res.ok) {
          throw new Error(`Performance unavailable (${res.status})`);
        }

        const data: BasketPerformance = await res.json();

        // 1 hour cache for historical timeframes, 1 minute for 24h
        const ttlMs = timeframe === "24h" ? 60_000 : 3600_000;
        this.cache.set(key, {
          performance: data,
          expiresAt: Date.now() + ttlMs,
        });

        this.notify();
        return data;
      } finally {
        this.inFlight.delete(key);
      }
    });

    this.inFlight.set(key, operation);
    return operation;
  }
}

export const basketPerformanceClient = new BasketPerformanceClient();
