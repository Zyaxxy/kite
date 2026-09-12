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

test('Price V3 recovers token quotes without using underlying references as trade prices', async () => {
  const fetcher = async input => {
    const url = String(input);
    if (url.includes('xstocks.fi')) return j({nodes:[
      {symbol:'Ax',name:'A',deployments:[{network:'Solana',address:mintA}]},
      {symbol:'Bx',name:'B',deployments:[{network:'Solana',address:mintB}]},
    ],page:{hasNextPage:false}});
    if (url.endsWith('/products')) return new Response('');
    if (url.endsWith('/api/metrics')) return j({metrics:[]});
    if (url.includes('/tokens/v2/')) return j([{id:mintA,stats24h:{buyVolume:5,sellVolume:10}}, {id:mintB}]);
    assert.ok(url.includes('/price/v3?ids='));
    return j({
      [mintA]: {usdPrice:125,decimals:8,blockId:12345,priceChange24h:-2,liquidity:500,stockData:{id:'xstocks',price:124,mcap:1000000,updatedAt:'2026-09-12T12:00:00Z'}},
      [mintB]: {decimals:8,stockData:{id:'xstocks',price:40,mcap:400000,updatedAt:'2026-09-12T12:00:00Z'}},
      [mintP]: {usdPrice:999},
    });
  };
  const snapshot = await getMainnetMarkets({fetcher});
  const a = snapshot.assets.find(asset=>asset.mint===mintA);
  const b = snapshot.assets.find(asset=>asset.mint===mintB);
  assert.equal(a.priceUsd,125);
  assert.equal(a.priceSource,'jupiter-price-v3');
  assert.equal(a.priceBlockId,12345);
  assert.equal(a.change24hPct,-2);
  assert.equal(a.volume24hUsd,15);
  assert.equal(a.underlyingPriceUsd,124);
  assert.equal(a.underlyingMarketCapUsd,1000000);
  assert.equal(a.marketCapUsd,null);
  assert.equal(b.priceUsd,null);
  assert.equal(b.priceObservedAt,null);
  assert.equal(b.underlyingPriceUsd,40);
  assert.equal(b.decimals,8);
  assert.equal(snapshot.assets.length,2);
});

test('price requests respect 50-mint limit and retain Tokens V2 prices during a V3 outage', async () => {
  const mints = Array.from({length:101},(_,i)=>'1'.repeat(30)+String(i+100).replaceAll('0','a'));
  const priceBatches = [];
  const fetcher = async input => {
    const url = new URL(String(input));
    if (url.hostname==='api.xstocks.fi') return j({nodes:mints.map((mint,index)=>({symbol:`T${index}x`,name:`Token ${index}`,deployments:[{network:'Solana',address:mint}]})),page:{hasNextPage:false}});
    if (url.pathname==='/products') return new Response('');
    if (url.pathname==='/api/metrics') return j({metrics:[]});
    if (url.pathname==='/tokens/v2/search') return j(url.searchParams.get('query').split(',').map(id=>({id,usdPrice:10,decimals:8})));
    priceBatches.push(url.searchParams.get('ids').split(','));
    return new Response('',{status:503});
  };
  const snapshot=await getMainnetMarkets({fetcher});
  assert.equal(snapshot.assets.length,101);
  assert.ok(snapshot.assets.every(asset=>asset.priceUsd===10&&asset.priceSource==='jupiter-tokens-v2'));
  assert.deepEqual(priceBatches.map(batch=>batch.length),[50,50,1]);
  assert.equal(snapshot.status,'partial');
});

test('all complete thematic baskets have exactly 10000 basis points and original, issuer-resolved members', () => {
  const symbols=['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','ORCL','AMD','AVGO','TSM','ASML','CRM','NOW','MCD','SBUX','KO','LLY','JNJ','ABBV','UNH','MRK','JPM','GS','V','MA','LMT','RTX','NOC','PLTR','XOM','CVX','COP','CAT','DE','GE','HON','SPY','QQQ','GLD'];
  const assets=symbols.map(underlyingSymbol=>({mint:underlyingSymbol,underlyingSymbol,issuer:'xstocks',priceUsd:100,tradingHalted:false}));
  assets.push({mint:mintP,underlyingSymbol:'PRIVATE',issuer:'prestocks',priceUsd:20,tradingHalted:false});
  const baskets=resolveMarketBaskets(assets);
  assert.equal(baskets.length,12);
  for(const basket of baskets){
    assert.equal(basket.available,true,basket.id);
    assert.equal(basket.assets.reduce((sum,member)=>sum+member.weight,0),10000,basket.id);
    assert.deepEqual(basket.missingSymbols,[]);
    assert.deepEqual(basket.unpricedSymbols,[]);
    assert.ok(basket.assets.every(member=>assets.includes(member.asset)));
  }
  assets.find(asset=>asset.underlyingSymbol==='NVDA').priceUsd=null;
  const incomplete=resolveMarketBaskets(assets).find(basket=>basket.id==='sol-chips');
  assert.equal(incomplete.available,false);
  assert.deepEqual(incomplete.unpricedSymbols,['NVDA']);
  assert.equal(incomplete.assets.reduce((sum,member)=>sum+member.weight,0),10000);
});

test('retries a rate-limited price batch using the provider reset window', async()=>{
  let priceCalls=0;
  const startedAt=Date.now();
  const fetcher=async input=>{
    const url=String(input);
    if(url.includes('xstocks.fi'))return j({nodes:[{symbol:'Ax',name:'A',deployments:[{network:'Solana',address:mintA}]}],page:{hasNextPage:false}});
    if(url.endsWith('/products'))return new Response('');
    if(url.endsWith('/api/metrics'))return j({metrics:[]});
    if(url.includes('/tokens/v2/'))return j([{id:mintA}]);
    if(priceCalls++===0)return new Response('',{status:429,headers:{'x-ratelimit-reset':String((Date.now()+100)/1000)}});
    return j({[mintA]:{usdPrice:25,decimals:8}});
  };
  const snapshot=await getMainnetMarkets({fetcher});
  assert.equal(priceCalls,2);
  assert.ok(Date.now()-startedAt>=100);
  assert.equal(snapshot.assets[0].priceUsd,25);
  assert.equal(snapshot.assets[0].priceSource,'jupiter-price-v3');
});

test('request cancellation stops quota waiting and preserves completed token quotes', async()=>{
  const controller=new AbortController();
  let priceCalls=0;
  const fetcher=async input=>{
    const url=String(input);
    if(url.includes('xstocks.fi'))return j({nodes:[{symbol:'Ax',name:'A',deployments:[{network:'Solana',address:mintA}]}],page:{hasNextPage:false}});
    if(url.endsWith('/products'))return new Response('');
    if(url.endsWith('/api/metrics'))return j({metrics:[]});
    if(url.includes('/tokens/v2/'))return j([{id:mintA,usdPrice:25}]);
    priceCalls++;
    setTimeout(()=>controller.abort(),10);
    return new Response('',{status:429,headers:{'retry-after':'10'}});
  };
  const snapshot=await getMainnetMarkets({fetcher,signal:controller.signal});
  assert.equal(priceCalls,1);
  assert.equal(snapshot.assets[0].priceUsd,25);
  assert.equal(snapshot.status,'partial');
});

test('issuer-only discovery performs no Jupiter requests', async () => {
  const { getMainnetCatalog } = require('../dist/markets.js');
  const requested = [];
  const catalog = await getMainnetCatalog({fetcher: async input => {
    const url = String(input); requested.push(url);
    if (url.includes('xstocks.fi')) return j({nodes:[{symbol:'Ax',name:'Issuer A',deployments:[{network:'Solana',address:mintA}]}],page:{hasNextPage:false}});
    if (url.endsWith('/products')) return new Response('');
    if (url.endsWith('/api/metrics')) return j({metrics:[]});
    throw new Error('Price lookup must not be needed to identify an asset');
  }});
  assert.equal(catalog.assets[0].mint,mintA);
  assert.equal(catalog.assets[0].priceUsd,null);
  assert.ok(requested.every(url=>!url.includes('jup.ag')));
});

test('token observations publish before blocked references and remain detached', async () => {
  const asset={mint:mintA,symbol:'Ax',underlyingSymbol:'A',issuer:'xstocks',priceUsd:null,verified:true,tradingHalted:false};
  const catalog={assets:[asset],baskets:[],asOf:new Date().toISOString(),network:'mainnet-beta',sources:['xStocks issuer catalog'],warnings:[],status:'live'};
  let finishPrice;
  const priceReady=new Promise(resolve=>{finishPrice=resolve;});
  let coreReady;
  const core=new Promise(resolve=>{coreReady=resolve;});
  const task=getMainnetMarkets({catalog,onUpdate:coreReady,fetcher:async input=>{
    if(String(input).includes('/tokens/v2/'))return j([{id:mintA,usdPrice:12,decimals:8}]);
    await priceReady;
    return j({[mintA]:{usdPrice:13,stockData:{id:'xstocks',price:14,updatedAt:'2026-09-12T12:00:00Z'}}});
  }});
  const early=await core;
  assert.equal(early.assets[0].priceUsd,12);
  assert.equal(asset.priceUsd,null,'caller-owned catalog is unchanged');
  finishPrice();
  const complete=await task;
  assert.equal(complete.assets[0].priceUsd,13);
  assert.equal(complete.assets[0].underlyingPriceUsd,14);
  assert.equal(early.assets[0].priceUsd,12,'later enrichment does not mutate the published response');
  assert.equal(early.assets[0].underlyingPriceUsd,undefined);
});

test('frequent token refreshes can omit the supplemental reference batches', async()=>{
  const asset={mint:mintA,symbol:'Ax',underlyingSymbol:'A',issuer:'xstocks',priceUsd:null,verified:true,tradingHalted:false};
  const catalog={assets:[asset],baskets:[],asOf:new Date().toISOString(),network:'mainnet-beta',sources:['xStocks issuer catalog'],warnings:[],status:'live'};
  const calls=[];
  const result=await getMainnetMarkets({catalog,includePriceReferences:false,fetcher:async input=>{
    calls.push(String(input));
    assert.ok(String(input).includes('/tokens/v2/'));
    return j([{id:mintA,usdPrice:20,decimals:8}]);
  }});
  assert.equal(calls.length,1);
  assert.equal(result.assets[0].priceUsd,20);
  assert.equal(result.assets[0].priceSource,'jupiter-tokens-v2');
});

test('token quotes available only through V3 still refresh between full reference passes', async()=>{
  const assets=[mintA,mintB].map((mint,index)=>({mint,symbol:`T${index}x`,underlyingSymbol:`T${index}`,issuer:'xstocks',priceUsd:null,verified:true,tradingHalted:false}));
  const catalog={assets,baskets:[],asOf:new Date().toISOString(),network:'mainnet-beta',sources:['xStocks issuer catalog'],warnings:[],status:'live'};
  const priceCalls=[];
  const result=await getMainnetMarkets({catalog,includePriceReferences:false,priceFallbackMints:[mintA,mintB],fetcher:async input=>{
    const url=new URL(String(input));
    if(url.pathname.includes('/tokens/'))return j([{id:mintA,usdPrice:12}]);
    priceCalls.push(url.searchParams.get('ids'));
    return j({[mintB]:{usdPrice:15,stockData:{id:'xstocks',price:99,updatedAt:'2026-09-12T12:00:00Z'}}});
  }});
  assert.deepEqual(priceCalls,[mintB],'already refreshed Tokens V2 mints do not need duplicate V3 price requests');
  assert.equal(result.assets.find(asset=>asset.mint===mintB).priceUsd,15);
  assert.equal(result.assets.find(asset=>asset.mint===mintB).priceSource,'jupiter-price-v3');
});
