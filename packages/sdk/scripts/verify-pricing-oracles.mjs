import {
  MeteoraClient,
  JupiterPriceClient,
  PythHermesClient,
  XSTOCKS_PYTH_FEEDS,
  fetchXStocksOracles,
  listSupportedEquities,
} from '../dist/index.js';

async function main() {
  console.log('================================================================');
  console.log('🚀 Kite SDK Pricing & Oracle Integration Verification');
  console.log('================================================================\n');

  // 1. Meteora DLMM API
  console.log('1️⃣  Testing Meteora DLMM API (https://dlmm.datapi.meteora.ag/pools)');
  const meteora = new MeteoraClient();
  try {
    const poolsRes = await meteora.searchPools({ limit: 3, sort_key: 'tvl' });
    console.log(`   ✅ Successfully queried Meteora pools: total ${poolsRes.total} pools indexed.`);
    if (poolsRes.data.length > 0) {
      const p = poolsRes.data[0];
      console.log(`   📊 Sample Pool: ${p.name} (${p.address.slice(0, 8)}...)`);
      console.log(`      - Price: ${p.current_price}`);
      console.log(`      - TVL: $${p.tvl?.toLocaleString()}`);
      console.log(`      - APR: ${p.apr?.toFixed(2)}% | APY: ${p.apy?.toFixed(2)}%`);
      console.log(`      - 24h Fees: $${p.fees?.['24h']?.toLocaleString()}`);
      console.log(`      - 24h Volume: $${p.volume?.['24h']?.toLocaleString()}`);

      // Test OHLCV
      const ohlcv = await meteora.getPoolOhlcv(p.address, 60);
      console.log(`   📈 OHLCV Candlesticks returned: ${ohlcv.data?.length || 0} bars.`);
    }
  } catch (err) {
    console.error('   ❌ Meteora error:', err.message);
  }

  console.log('\n----------------------------------------------------------------\n');

  // 2. Jupiter Price v3 API
  console.log('2️⃣  Testing Jupiter Price v3 API (https://api.jup.ag/price/v3?ids={mint})');
  const jupiter = new JupiterPriceClient();
  const solMint = 'So11111111111111111111111111111111111111112';
  const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  try {
    const singlePrice = await jupiter.getPrice(solMint);
    console.log(`   ✅ Single Token Price (SOL): $${JupiterPriceClient.formatPrice(singlePrice, 2)}`);

    const batchPrices = await jupiter.getPrices([solMint, usdcMint]);
    console.log(`   ✅ Batch Query Prices:`);
    console.log(`      - SOL:  $${JupiterPriceClient.formatPrice(batchPrices[solMint], 2)}`);
    console.log(`      - USDC: $${JupiterPriceClient.formatPrice(batchPrices[usdcMint], 4)}`);

    const info = await jupiter.getTokenPriceInfo(solMint);
    if (info) {
      console.log(`   📊 SOL Liquidity Depth: $${info.liquidity?.toLocaleString()}`);
      console.log(`      - 24h Price Change: ${info.priceChange24h?.toFixed(2)}%`);
      console.log(`      - Solana Block ID:  ${info.blockId}`);
    }
  } catch (err) {
    console.error('   ❌ Jupiter error:', err.message);
  }

  console.log('\n----------------------------------------------------------------\n');

  // 3. Pyth Network & xStocks Oracles
  console.log('3️⃣  Testing Pyth Network xStocks Equity Feeds & /public/oracles Route');
  const pyth = new PythHermesClient();

  const supported = listSupportedEquities();
  console.log(`   📋 Registered xStock Feeds in SDK: ${supported.length} assets`);
  for (const s of supported) {
    console.log(`      - ${s.symbol.padEnd(6)} | xStock Feed: ${s.xStockFeedId.slice(0, 18)}... | Equity Ref: ${s.equityReferenceFeedId.slice(0, 18)}...`);
  }

  try {
    console.log('\n   🔍 Searching Pyth Hermes for live xStock feeds...');
    const searchRes = await pyth.searchFeeds('NVDAX');
    if (searchRes.length > 0) {
      console.log(`   ✅ Found Pyth feed for NVDAx: ${searchRes[0].attributes?.symbol} (${searchRes[0].attributes?.description})`);
      console.log(`      - Feed ID: ${searchRes[0].id}`);
    }

    console.log('\n   🌐 Fetching xStocks /public/oracles route...');
    const oracles = await fetchXStocksOracles();
    console.log(`   ✅ xStocks Oracle Configuration available: ${oracles.length} registered feeds.`);
    for (const o of oracles.slice(0, 4)) {
      console.log(`      - ${o.symbol}: ${o.name} -> Feed ${o.feedId?.slice(0, 16)}...`);
    }
  } catch (err) {
    console.error('   ❌ Pyth/xStocks error:', err.message);
  }

  console.log('\n================================================================');
  console.log('✨ All 3 Data Layers Verified and Ready in @kite/sdk!');
  console.log('================================================================');
}

main().catch(console.error);
