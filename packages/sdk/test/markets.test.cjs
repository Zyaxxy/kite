const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getMainnetMarkets, resolveMarketBaskets } = require('../dist/markets.js');

// Provider fixtures are only used in tests, never shipped as fallback market data.
const mintA = '11111111111111111111111111111111';
const mintB = '22222222222222222222222222222222';
const mintP = '33333333333333333333333333333333';
const j = value => new Response(JSON.stringify(value), {status:200});

test('paginates the issuer catalog, resolves only issuer mints and preserves unavailable data', async () => {
  const requested = [];
  const products = [{symbol:'PRIVATE', name:'Private Company',splMint:mintP,decimals:9,skipPipeline:true}];
  const flight = '1:' + JSON.stringify({products}) + '\n';
  const html = `<script nonce="example">self.__next_f.push(${JSON.stringify([1,flight])})</script>`;
  const fetcher = async input => {
    const url = String(input); requested.push(url);
    if (url.includes('xstocks.fi')) return url.includes('page=0') ? j({nodes:[{symbol:'Ax',name:'Issuer A',underlying:{symbol:'A',type:'Equity'},deployments:[{network:'Solana',address:mintA},{network:'Ethereum',address:'0xwrong'}]}],page:{hasNextPage:true}}) : j({nodes:[{symbol:'Bx',name:'Issuer B',deployments:[{network:'Solana',address:mintB}]}],page:{hasNextPage:false}});
    if (url.endsWith('/products')) return new Response(html);
    if (url.endsWith('/api/metrics')) return j({metrics:[{symbol:'PRIVATE',splMint:mintP,tokenPrice:20}]});
    return j([{id:mintA,decimals:8,usdPrice:25,stats24h:{priceChange:2,buyVolume:100,sellVolume:50}}, {id:'44444444444444444444444444444444',symbol:'SPOOF',decimals:9,usdPrice:100}]);
  };
  const snapshot = await getMainnetMarkets({fetcher});
  assert.equal(snapshot.assets.length,3);
  assert.equal(snapshot.assets.find(a=>a.mint===mintA).volume24hUsd,150);
  assert.equal(snapshot.assets.find(a=>a.mint===mintB).priceUsd,null);
  assert.equal(snapshot.assets.find(a=>a.mint===mintB).decimals,null);
  assert.equal(snapshot.assets.find(a=>a.mint===mintB).kind,'unknown');
  assert.equal(snapshot.assets.find(a=>a.mint===mintP).tradingHalted,true);
  assert.equal(snapshot.assets.find(a=>a.mint===mintP).decimals,9);
  assert.ok(requested.some(url=>url.includes('page=1')));
  assert.equal(snapshot.status,'partial');
});

test('provider outages produce honest unavailable state with no seeded assets or prices', async () => {
  const snapshot = await getMainnetMarkets({fetcher:async()=>{throw new Error('offline');}});
  assert.deepEqual(snapshot.assets,[]); assert.equal(snapshot.status,'unavailable');
  assert.ok(snapshot.baskets.every(basket=>!basket.available));
});

test('missing basket members do not cause silent weight renormalization', () => {
  const assets = ['AAPL','MSFT','NVDA','AMZN','GOOGL','META'].map(underlyingSymbol=>({underlyingSymbol,issuer:'xstocks',priceUsd:100,tradingHalted:false}));
  const basket = resolveMarketBaskets(assets)[0];
  assert.equal(basket.available,false); assert.deepEqual(basket.missingSymbols,['TSLA']);
  assert.ok(basket.assets.reduce((sum,member)=>sum+member.weight,0)<10000);
});
