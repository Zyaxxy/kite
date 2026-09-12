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
