const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getMarketPulse } = require('../dist/market-pulse.js');

const asset=(symbol,change24hPct,volume24hUsd,extra={})=>({mint:symbol,symbol,priceUsd:10,tradingHalted:false,change24hPct,volume24hUsd,...extra});

test('market pulse computes covered breadth and volume without treating missing quotes as zero',()=>{
  const assets=[asset('A',5,100),asset('B',-3,200),asset('C',0,0),asset('D',null,null),asset('E',20,1000,{priceUsd:null,underlyingPriceUsd:40}),asset('F',50,2000,{tradingHalted:true})];
  const before=JSON.stringify(assets);
  const pulse=getMarketPulse(assets);
  assert.equal(pulse.totalAssets,6);
  assert.equal(pulse.tradableAssets,5);
  assert.equal(pulse.pricedAssets,4);
  assert.deepEqual({...pulse.breadth,advancingPct:null},{advancing:1,declining:1,unchanged:1,coveredAssets:3,advancingPct:null});
  assert.ok(Math.abs(pulse.breadth.advancingPct-100/3)<1e-10);
  assert.equal(pulse.volume24hUsd,300);
  assert.equal(pulse.volumeCoveredAssets,3);
  assert.deepEqual(pulse.topVolume.map(a=>a.symbol),['B','A','C']);
  assert.deepEqual(pulse.gainers.map(a=>a.symbol),['A']);
  assert.deepEqual(pulse.losers.map(a=>a.symbol),['B']);
  assert.equal(JSON.stringify(assets),before);
});

test('market pulse handles empty coverage, duplicate mints and invalid numeric values',()=>{
  assert.equal(getMarketPulse([]).volume24hUsd,null);
  assert.equal(getMarketPulse([]).breadth.advancingPct,null);
  const pulse=getMarketPulse([asset('A',5,10),asset('A',2,3),asset('B',NaN,-10),asset('C',1,10,{priceUsd:Infinity})],1);
  assert.equal(pulse.totalAssets,3);
  assert.equal(pulse.breadth.coveredAssets,1);
  assert.equal(pulse.volume24hUsd,3);
  assert.equal(pulse.topVolume.length,1);
});

test('market pulse safeguards exclude illiquid (<$1000) and depegged (>15%) assets from movers', () => {
  const assets = [
    asset('LEGIT_GAINER', 12, 500, { liquidityUsd: 5000, priceUsd: 100, underlyingPriceUsd: 100 }),
    asset('ILLIQUID_GAINER', 39, 292, { liquidityUsd: 79.9, priceUsd: 278.8, underlyingPriceUsd: 70.66 }),
    asset('DEPEGGED_GAINER', 25, 1000, { liquidityUsd: 50000, priceUsd: 150, underlyingPriceUsd: 100 }),
    asset('LEGIT_LOSER', -8, 400, { liquidityUsd: 8000, priceUsd: 50, underlyingPriceUsd: 50 }),
    asset('ILLIQUID_LOSER', -40, 100, { liquidityUsd: 120 }),
    asset('UNTRACKED_LIQ', 6, 200), // undefined liquidity should not be filtered out
  ];
  const pulse = getMarketPulse(assets, 10);
  // Breadth still includes all 6 changing assets (objective market breadth)
  assert.equal(pulse.breadth.coveredAssets, 6);
  assert.equal(pulse.breadth.advancing, 4);
  assert.equal(pulse.breadth.declining, 2);

  // Gainers: ILLIQUID_GAINER (liq $79.9 < $1000) and DEPEGGED_GAINER (50% divergence > 15%) are excluded!
  assert.deepEqual(pulse.gainers.map(a => a.symbol), ['LEGIT_GAINER', 'UNTRACKED_LIQ']);

  // Losers: ILLIQUID_LOSER (liq $120 < $1000) is excluded!
  assert.deepEqual(pulse.losers.map(a => a.symbol), ['LEGIT_LOSER']);

  // Top Volume: ILLIQUID_GAINER and ILLIQUID_LOSER excluded from top movers
  assert.deepEqual(pulse.topVolume.map(a => a.symbol), ['LEGIT_GAINER', 'LEGIT_LOSER', 'UNTRACKED_LIQ']);

  // Safeguards can be disabled with options: { minLiquidityUsd: 0, maxDivergencePct: 0 }
  const unfiltered = getMarketPulse(assets, 10, { minLiquidityUsd: 0, maxDivergencePct: 0 });
  assert.equal(unfiltered.gainers.length, 4);
  assert.equal(unfiltered.losers.length, 2);
});

