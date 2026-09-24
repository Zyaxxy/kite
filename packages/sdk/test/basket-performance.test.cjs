const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateBasket24hGrowth,
  fetchBasketHistoricalPerformance,
  simulateBasketReturn,
  extractBasketMembers,
} = require('../dist/basket/performance.js');

const makeAsset = (symbol, change24hPct, priceUsd = 100, extra = {}) => ({
  mint: `${symbol}_MINT_111111111111111111111111111111`,
  symbol,
  underlyingSymbol: symbol,
  name: `${symbol} Inc.`,
  priceUsd,
  change24hPct,
  tradingHalted: false,
  ...extra,
});

test('calculateBasket24hGrowth calculates exact weighted return and attribution for a balanced basket', () => {
  const basket = {
    id: 'test-basket-ai',
    name: 'AI Test Basket',
    assets: [
      { asset: makeAsset('NVDA', 5.0, 120), weight: 5000 },
      { asset: makeAsset('MSFT', -1.0, 400), weight: 5000 },
    ],
  };

  const perf = calculateBasket24hGrowth(basket, 1000);
  assert.equal(perf.basketId, 'test-basket-ai');
  assert.equal(perf.timeframe, '24h');
  assert.equal(perf.status, 'live');
  // (5000/10000)*5.0 + (5000/10000)*(-1.0) = 2.5 - 0.5 = 2.0%
  assert.equal(perf.changePct, 2.0);
  assert.equal(perf.gainLossUsd, 20.0);
  assert.equal(perf.endValueUsd, 1020.0);
  assert.equal(perf.constituents.length, 2);

  // Attribution
  assert.equal(perf.constituents[0].symbol, 'NVDA');
  assert.equal(perf.constituents[0].contributionPct, 2.5);
  assert.equal(perf.constituents[1].symbol, 'MSFT');
  assert.equal(perf.constituents[1].contributionPct, -0.5);

  assert.equal(perf.topGainer.symbol, 'NVDA');
  assert.equal(perf.topLoser.symbol, 'MSFT');
});

test('calculateBasket24hGrowth handles partial pricing without fabricating data', () => {
  const basket = {
    id: 'test-partial',
    name: 'Partial Basket',
    assets: [
      { asset: makeAsset('AAPL', 4.0, 200), weight: 5000 },
      { asset: makeAsset('UNPRICED', null, null), weight: 5000 },
    ],
  };

  const perf = calculateBasket24hGrowth(basket, 1000);
  assert.equal(perf.status, 'partial');
  assert.ok(perf.warnings.length > 0);
  // Renormalized against priced asset: 4.0%
  assert.equal(perf.changePct, 4.0);
  assert.equal(perf.constituents[1].changePct, null);
  assert.equal(perf.constituents[1].contributionPct, null);
});

test('calculateBasket24hGrowth returns unavailable when all assets are unpriced or empty', () => {
  const emptyPerf = calculateBasket24hGrowth({ id: 'empty', assets: [] });
  assert.equal(emptyPerf.status, 'unavailable');
  assert.equal(emptyPerf.changePct, null);

  const unpricedPerf = calculateBasket24hGrowth({
    id: 'all-unpriced',
    assets: [{ asset: makeAsset('A', null, null) }, { asset: makeAsset('B', null, null) }],
  });
  assert.equal(unpricedPerf.status, 'unavailable');
  assert.equal(unpricedPerf.changePct, null);
});

test('simulateBasketReturn calculates exact profit and loss on custom amounts', () => {
  const perf = { changePct: 15.5 };
  const sim = simulateBasketReturn(perf, 5000);
  assert.equal(sim.initialUsd, 5000);
  assert.equal(sim.gainLossUsd, 775.0);
  assert.equal(sim.finalUsd, 5775.0);
  assert.equal(sim.gainLossPct, 15.5);
  assert.equal(sim.isProfit, true);

  const lossPerf = { changePct: -8.2 };
  const lossSim = simulateBasketReturn(lossPerf, 1000);
  assert.equal(lossSim.gainLossUsd, -82.0);
  assert.equal(lossSim.finalUsd, 918.0);
  assert.equal(lossSim.isProfit, false);
});

test('extractBasketMembers normalizes both raw asset arrays and MarketBasket schemas', () => {
  // Case 1: MarketBasket format with source
  const displayBasket = {
    source: {
      assets: [
        { asset: makeAsset('A', 1), weight: 6000 },
        { asset: makeAsset('B', 2), weight: 4000 },
      ],
    },
  };
  const members1 = extractBasketMembers(displayBasket);
  assert.equal(members1.length, 2);
  assert.equal(members1[0].weightBps, 6000);
  assert.equal(members1[1].weightBps, 4000);

  // Case 2: Direct assets array without explicit weights (equal weights via Hare-Niemeyer)
  const plainBasket = {
    assets: [makeAsset('A', 1), makeAsset('B', 2), makeAsset('C', 3)],
  };
  const members2 = extractBasketMembers(plainBasket);
  assert.equal(members2.length, 3);
  // 10000 / 3 = 3333 with 1 remainder -> 3334, 3333, 3333
  assert.equal(members2[0].weightBps, 3334);
  assert.equal(members2[1].weightBps, 3333);
  assert.equal(members2[2].weightBps, 3333);
  assert.equal(members2[0].weightBps + members2[1].weightBps + members2[2].weightBps, 10000);
});

test('fetchBasketHistoricalPerformance computes normalized NAV series and attribution using mock fetcher', async () => {
  const mockBars = {
    AAPL: [
      { date: '2026-09-17', close: 100 },
      { date: '2026-09-18', close: 105 },
      { date: '2026-09-19', close: 110 },
    ],
    MSFT: [
      { date: '2026-09-17', close: 200 },
      { date: '2026-09-18', close: 190 },
      { date: '2026-09-19', close: 210 },
    ],
  };

  const mockFetcher = async (url) => {
    const symMatch = url.match(/\/chart\/([A-Za-z]+)\?/);
    const sym = symMatch ? symMatch[1] : '';
    const bars = mockBars[sym] || [];
    return {
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              timestamp: bars.map((b) => Math.floor(new Date(`${b.date}T00:00:00Z`).getTime() / 1000)),
              indicators: {
                quote: [{ close: bars.map((b) => b.close) }],
              },
            },
          ],
        },
      }),
    };
  };

  const basket = {
    id: 'test-tech',
    name: 'Tech Basket',
    assets: [
      { asset: makeAsset('AAPL', 0), weight: 5000 },
      { asset: makeAsset('MSFT', 0), weight: 5000 },
    ],
  };

  const perf = await fetchBasketHistoricalPerformance({
    basket,
    timeframe: '7d',
    baseAmountUsd: 1000,
    options: {
      fetcher: mockFetcher,
      now: () => new Date('2026-09-20T00:00:00Z').getTime(),
    },
  });

  assert.equal(perf.status, 'live');
  assert.equal(perf.timeframe, '7d');
  assert.equal(perf.history.length, 3);
  // Start: NAV = 100
  assert.equal(perf.history[0].value, 100);
  assert.equal(perf.history[0].changePct, 0);

  // Day 3:
  // AAPL: 100 -> 110 (+10%), MSFT: 200 -> 210 (+5%)
  // Basket NAV: 0.5 * 110 + 0.5 * 105 = 55 + 52.5 = 107.5
  assert.equal(perf.history[2].value, 107.5);
  assert.equal(perf.changePct, 7.5);
  assert.equal(perf.gainLossUsd, 75.0);
  assert.equal(perf.endValueUsd, 1075.0);

  // Constituents attribution:
  assert.equal(perf.constituents[0].symbol, 'AAPL');
  assert.equal(perf.constituents[0].changePct, 10.0);
  assert.equal(perf.constituents[0].contributionPct, 5.0);

  assert.equal(perf.constituents[1].symbol, 'MSFT');
  assert.equal(perf.constituents[1].changePct, 5.0);
  assert.equal(perf.constituents[1].contributionPct, 2.5);
});
