const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPaperAccount, executePaperOrder, executePaperBasket, valuePaperAccount, parsePaperAccount, createPaperPlan, runDuePaperPlans, nextPaperExecution } = require('../dist/paper.js');

const now = '2026-09-12T12:00:00.000Z';
function asset(overrides = {}) { return { mint: 'test-mint', symbol: 'TEST', priceUsd: 50, priceObservedAt: now, verified: true, tradingHalted: false, ...overrides }; }

test('paper buy and partial sale conserve cash and remaining cost basis without mutating input', () => {
  const start = createPaperAccount(1000);
  const bought = executePaperOrder(start, asset(), 'buy', 200, now);
  assert.equal(start.cashUsd, 1000); assert.equal(start.positions.length, 0);
  assert.equal(bought.cashUsd, 800); assert.equal(bought.positions[0].quantity, 4);
  const sold = executePaperOrder(bought, asset({priceUsd: 100}), 'sell', 200, now);
  assert.equal(sold.cashUsd, 1000); assert.equal(sold.positions[0].quantity, 2);
  assert.equal(sold.positions[0].costBasisUsd, 100);
  assert.equal(valuePaperAccount(sold, [asset({priceUsd: 100})]).profitLossUsd, 200);
});

test('rejects insufficient funds, overselling, missing quotes, stale quotes, halted assets and invalid numbers', () => {
  const start = createPaperAccount(1000);
  for (const amount of [0, -1, NaN, Infinity, 1001]) assert.throws(() => executePaperOrder(start, asset(), 'buy', amount, now));
  assert.throws(() => executePaperOrder(start, asset(), 'sell', 100, now), /holdings/);
  assert.throws(() => executePaperOrder(start, asset({priceUsd: null}), 'buy', 100, now), /live market price/);
  assert.throws(() => executePaperOrder(start, asset({priceObservedAt: '2026-09-12T11:00:00Z'}), 'buy', 100, now), /Refresh/);
  assert.throws(() => executePaperOrder(start, asset({tradingHalted: true}), 'buy', 100, now), /unavailable/);
  assert.throws(() => executePaperOrder(start, asset(), 'hold', 100, now), /side/);
});

test('basket is all-or-nothing and requires complete allocations', () => {
  const start = createPaperAccount(1000);
  const basket = { available: true, assets: [{ asset: asset(), weight: 5000 }, { asset: asset({ mint: 'other', priceUsd: null }), weight: 5000 }] };
  assert.throws(() => executePaperBasket(start, basket, 500, now));
  assert.equal(start.cashUsd,1000); assert.deepEqual(start.orders, []);
  assert.throws(() => executePaperBasket(start, {...basket, assets:[{asset:asset(),weight:9999}]}, 500, now), /100%/);
});

test('missing prices make portfolio valuation unavailable instead of valuing holdings at zero', () => {
  const bought = executePaperOrder(createPaperAccount(), asset(), 'buy', 100, now);
  const value = valuePaperAccount(bought, []);
  assert.equal(value.totalUsd, null); assert.equal(value.profitLossUsd, null); assert.deepEqual(value.unpricedMints, ['test-mint']);
});

test('monthly plans clamp to month-end; app-open execution does not fabricate missed installments', () => {
  assert.equal(nextPaperExecution('monthly', '2026-01-31T12:00:00Z'), '2026-02-28T12:00:00.000Z');
  let account = createPaperPlan(createPaperAccount(1000), { targetId: 'test-mint', targetType: 'asset', name: 'Test', amountUsd: 100, frequency: 'daily' }, '2026-09-01T12:00:00Z');
  account = runDuePaperPlans(account, { assets: [asset()], baskets: [] }, now);
  assert.equal(account.orders.length, 1); assert.equal(account.cashUsd, 900);
  assert.equal(account.plans[0].nextExecutionAt, '2026-09-13T12:00:00.000Z');
  assert.equal(runDuePaperPlans(account, {assets:[asset()],baskets:[]}, now).orders.length, 1);
});

test('persisted state rejects corruption and migrates a valid version-one account without plans', () => {
  const account = createPaperAccount(); assert.deepEqual(parsePaperAccount(JSON.parse(JSON.stringify(account))), account);
  assert.equal(parsePaperAccount({...account,cashUsd:-1}), null);
  assert.equal(parsePaperAccount({...account,positions:[{mint:'a',symbol:'A',quantity:Infinity,costBasisUsd:1}]}),null);
  assert.equal(parsePaperAccount({...account,orders:[{}]}),null);
  const {plans, ...legacy} = account; assert.deepEqual(parsePaperAccount(legacy).plans,[]);
});

test('an existing paper basket plan retains all seven original members after mainnet publication is narrowed', () => {
  const { resolveReviewedMarketBaskets } = require('../dist/markets.js');
  const symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'];
  const assets = symbols.map(symbol => asset({ mint: symbol, symbol: `${symbol}x`, underlyingSymbol: symbol, issuer: 'xstocks' }));
  const account = createPaperPlan(createPaperAccount(1000), { targetId: 'sol-mag7', targetType: 'basket', name: 'The Magnificent Seven', amountUsd: 100, frequency: 'daily' }, '2026-09-01T12:00:00Z');
  const snapshot = { assets, baskets: resolveReviewedMarketBaskets(assets) };
  const result = runDuePaperPlans(account, snapshot, now);
  assert.equal(result.plans[0].lastError, null);
  assert.equal(result.orders.length, 7);
  assert.deepEqual(result.positions.map(position => position.mint).sort(), [...symbols].sort());
  assert.ok(Math.abs(result.cashUsd - 900) < 1e-8);
  assets[6].priceUsd = null;
  const blocked = runDuePaperPlans(account, snapshot, now);
  assert.equal(blocked.orders.length, 0, 'missing historical leg still fails the complete paper installment');
  assert.equal(blocked.cashUsd, 1000);
});
