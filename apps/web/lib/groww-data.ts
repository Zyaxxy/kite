export interface StockItem {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  price: number;
  change1d: number;
  change1dAmount: number;
  sparkline: number[];
  volume24h: string;
  marketCap: string;
  peRatio: number;
  pbRatio: number;
  industryPe: number;
  debtToEquity: number;
  roe: number;
  eps: number;
  divYield: number;
  bookValue: number;
  faceValue: number;
  todayLow: number;
  todayHigh: number;
  week52Low: number;
  week52High: number;
  openPrice: number;
  prevClose: number;
  lowerCircuit: number;
  upperCircuit: number;
  pythFeedId: string;
  mintAddress: string;
  sentimentScore: number;
  sentimentLabel: 'Very Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Very Bearish';
  news: { headline: string; source: string; time: string; sentiment: 'positive' | 'neutral' | 'negative' }[];
  quarterly: { quarter: string; revenue: number; profit: number }[];
}

export interface BasketItem {
  id: string;
  name: string;
  ticker: string;
  tag: string;
  description: string;
  return3Y: number;
  return1Y: number;
  risk: 'Low' | 'Moderate' | 'High';
  nav: number;
  change1d: number;
  assetsCount: number;
  rebalanceDays: number;
  minInvestment: number;
  icon: string;
  constituents: { symbol: string; name: string; weight: number; price: number; change24h: number }[];
}

export interface ActiveSIP {
  id: string;
  name: string;
  targetSymbol: string;
  amount: number;
  frequency: 'Monthly' | 'Weekly' | 'Daily';
  nextDueDate: string;
  category: string;
  totalInvested: number;
  currentValue: number;
  returnsPercent: number;
  iconBg: string;
  iconLetter: string;
  status: 'Active' | 'Paused';
}

export interface PortfolioHolding {
  id: string;
  symbol: string;
  name: string;
  type: 'Basket' | 'Stock';
  shares: number;
  avgPrice: number;
  marketPrice: number;
  investedValue: number;
  currentValue: number;
  dayChangeAmount: number;
  dayChangePercent: number;
  totalReturnsAmount: number;
  totalReturnsPercent: number;
  xirr: number;
  sparkline: number[];
}

export const GROWW_INDICES = [
  { name: 'NIFTY / SOL', value: '23,398.10', change: -79.70, percent: -0.34, up: false },
  { name: 'SENSEX / BTC', value: '74,781.76', change: -120.83, percent: -0.16, up: false },
  { name: 'BANKNIFTY / ETH', value: '56,606.55', change: 134.60, percent: 0.24, up: true },
  { name: 'MAG7 INDEX', value: '14,584.70', change: 56.40, percent: 0.39, up: true },
  { name: 'US AI TECH', value: '25,545.40', change: 112.30, percent: 0.44, up: true }
];

export const POPULAR_BASKETS: BasketItem[] = [
  {
    id: 'sol-mag7',
    name: 'MAG7 Tech Index Basket',
    ticker: 'SOL-MAG7',
    tag: 'Popular Tech',
    description: 'Equal-weighted exposure to Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta, and Tesla.',
    return3Y: 35.84,
    return1Y: 49.20,
    risk: 'Moderate',
    nav: 248.50,
    change1d: 1.42,
    assetsCount: 7,
    rebalanceDays: 30,
    minInvestment: 50,
    icon: '⚡',
    constituents: [
      { symbol: 'xNVDA', name: 'Nvidia Corp.', weight: 14.3, price: 124.50, change24h: 3.82 },
      { symbol: 'xAAPL', name: 'Apple Inc.', weight: 14.3, price: 228.15, change24h: -0.45 },
      { symbol: 'xMSFT', name: 'Microsoft Corp.', weight: 14.3, price: 432.90, change24h: 1.15 },
      { symbol: 'xAMZN', name: 'Amazon.com Inc.', weight: 14.3, price: 186.20, change24h: 0.85 },
      { symbol: 'xGOOGL', name: 'Alphabet Inc.', weight: 14.3, price: 162.40, change24h: -0.30 },
      { symbol: 'xMETA', name: 'Meta Platforms', weight: 14.3, price: 512.10, change24h: 2.10 },
      { symbol: 'xTSLA', name: 'Tesla Inc.', weight: 14.2, price: 215.80, change24h: -2.10 }
    ]
  },
  {
    id: 'sol-ai-infra',
    name: 'AI & Semiconductor Leaders',
    ticker: 'SOL-AI',
    tag: 'High Growth',
    description: 'Premier compute, cloud, and AI foundation builders powering the frontier models.',
    return3Y: 24.64,
    return1Y: 62.15,
    risk: 'High',
    nav: 310.20,
    change1d: 2.85,
    assetsCount: 5,
    rebalanceDays: 30,
    minInvestment: 25,
    icon: '🤖',
    constituents: [
      { symbol: 'xNVDA', name: 'Nvidia Corp.', weight: 35, price: 124.50, change24h: 3.82 },
      { symbol: 'xMSFT', name: 'Microsoft Corp.', weight: 25, price: 432.90, change24h: 1.15 },
      { symbol: 'xGOOGL', name: 'Alphabet Inc.', weight: 20, price: 162.40, change24h: -0.30 },
      { symbol: 'xARM', name: 'Arm Holdings', weight: 10, price: 138.70, change24h: 4.10 },
      { symbol: 'xPLTR', name: 'Palantir Tech', weight: 10, price: 34.50, change24h: 5.20 }
    ]
  },
  {
    id: 'sol-pre-stocks',
    name: 'Pre-IPO Tech Giants',
    ticker: 'PRE-TECH',
    tag: 'Unicorns',
    description: 'Pre-market tokenized secondary shares of top private technology pioneers.',
    return3Y: 16.91,
    return1Y: 28.40,
    risk: 'High',
    nav: 185.00,
    change1d: 0.95,
    assetsCount: 3,
    rebalanceDays: 60,
    minInvestment: 100,
    icon: '🚀',
    constituents: [
      { symbol: 'preOPENAI', name: 'OpenAI Pre-Stock', weight: 40, price: 150.00, change24h: 0.00 },
      { symbol: 'preSPACEX', name: 'SpaceX Pre-Stock', weight: 35, price: 210.00, change24h: 1.50 },
      { symbol: 'preSTRIPE', name: 'Stripe Pre-Stock', weight: 25, price: 95.00, change24h: 0.50 }
    ]
  },
  {
    id: 'sol-clean-green',
    name: 'Clean Energy & Robotics',
    ticker: 'SOL-GREEN',
    tag: 'RWA & ESG',
    description: 'Decarbonization tech, next-generation battery infrastructure, and physical robotics.',
    return3Y: 12.32,
    return1Y: 18.75,
    risk: 'Moderate',
    nav: 142.30,
    change1d: -0.40,
    assetsCount: 4,
    rebalanceDays: 45,
    minInvestment: 25,
    icon: '🌱',
    constituents: [
      { symbol: 'xTSLA', name: 'Tesla Inc.', weight: 35, price: 215.80, change24h: -2.10 },
      { symbol: 'xENPH', name: 'Enphase Energy', weight: 25, price: 112.40, change24h: 1.20 },
      { symbol: 'xFSLR', name: 'First Solar', weight: 20, price: 218.00, change24h: 0.80 },
      { symbol: 'xRIVN', name: 'Rivian Auto', weight: 20, price: 14.20, change24h: -1.50 }
    ]
  }
];

export const GROWW_COLLECTIONS = [
  { id: 'high-return', title: 'High return', subtitle: 'Highest 3Y annualized growth', icon: '💰', color: 'from-emerald-500/20 to-teal-500/10' },
  { id: 'best-sip', title: 'Best SIP funds', subtitle: 'Top automated DCA performers', icon: '💼', color: 'from-blue-500/20 to-cyan-500/10' },
  { id: 'gold-silver', title: 'Gold & Silver', subtitle: 'Tokenized precious metals', icon: '🪙', color: 'from-amber-500/20 to-yellow-500/10' },
  { id: 'large-cap', title: 'Large Cap Tech', subtitle: 'Global multi-trillion leaders', icon: '🏢', color: 'from-indigo-500/20 to-purple-500/10' },
  { id: 'mid-cap', title: 'Mid Cap AI', subtitle: 'Rapid scaling innovators', icon: '🤖', color: 'from-rose-500/20 to-pink-500/10' },
  { id: 'pre-ipo', title: 'Pre-IPO Shares', subtitle: 'OpenAI, SpaceX, Stripe', icon: '🚀', color: 'from-cyan-500/20 to-sky-500/10' }
];

export const GROWW_STOCKS: Record<string, StockItem> = {
  NVDA: {
    symbol: 'NVDA',
    name: 'Nvidia Corporation',
    exchange: 'NASDAQ • SPL Token',
    category: 'Semiconductors / AI',
    price: 124.50,
    change1d: 3.82,
    change1dAmount: 4.58,
    sparkline: [118.2, 119.5, 121.0, 120.4, 122.8, 123.6, 124.5],
    volume24h: '3,14,11,934',
    marketCap: '$3,09,294Cr',
    peRatio: 71.22,
    pbRatio: 9.97,
    industryPe: 129.73,
    debtToEquity: 0.15,
    roe: 1.18,
    eps: 0.45,
    divYield: 0.00,
    bookValue: 32.14,
    faceValue: 1.0,
    todayLow: 119.20,
    todayHigh: 125.40,
    week52Low: 45.60,
    week52High: 140.76,
    openPrice: 120.10,
    prevClose: 119.92,
    lowerCircuit: 107.92,
    upperCircuit: 131.91,
    pythFeedId: '0xa412ea6eb7ecf265fb26079979cc3cf78183069c9b1f2ebff1562b8a7862c161',
    mintAddress: 'NVDAxTokenMint11111111111111111111111111111',
    sentimentScore: 0.85,
    sentimentLabel: 'Very Bullish',
    news: [
      { headline: 'Blackwell chip demand outstripping supply through Q4', source: 'Bloomberg', time: '18 minutes ago', sentiment: 'positive' },
      { headline: 'Hyperscalers increase AI capex projections by 22%', source: 'Reuters', time: '42 minutes ago', sentiment: 'positive' },
      { headline: 'Wall Street reiterates Overweight on data center acceleration', source: 'Morgan Stanley', time: '2 hours ago', sentiment: 'positive' }
    ],
    quarterly: [
      { quarter: 'Q3 25', revenue: 18120, profit: 9240 },
      { quarter: 'Q4 25', revenue: 22100, profit: 12285 },
      { quarter: 'Q1 26', revenue: 26040, profit: 14880 },
      { quarter: 'Q2 26', revenue: 30040, profit: 16599 }
    ]
  },
  AAPL: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ • SPL Token',
    category: 'Consumer Electronics',
    price: 228.15,
    change1d: -0.45,
    change1dAmount: -1.03,
    sparkline: [230.1, 229.4, 228.8, 229.0, 227.9, 228.4, 228.15],
    volume24h: '1,82,45,612',
    marketCap: '$3,48,150Cr',
    peRatio: 33.40,
    pbRatio: 48.20,
    industryPe: 35.10,
    debtToEquity: 1.45,
    roe: 1.42,
    eps: 6.80,
    divYield: 0.52,
    bookValue: 4.80,
    faceValue: 1.0,
    todayLow: 226.50,
    todayHigh: 230.10,
    week52Low: 164.08,
    week52High: 237.23,
    openPrice: 229.20,
    prevClose: 229.18,
    lowerCircuit: 206.26,
    upperCircuit: 252.09,
    pythFeedId: '0x49f6b65db1de8ab7a264a4a6e5a67678994363dbab12932b82772e73e1622548',
    mintAddress: 'AAPLxTokenMint11111111111111111111111111111',
    sentimentScore: 0.20,
    sentimentLabel: 'Neutral',
    news: [
      { headline: 'iPhone 16 AI features rolling out gradually across international markets', source: 'WSJ', time: '34 minutes ago', sentiment: 'neutral' },
      { headline: 'App Store revenue shows resilient single-digit services growth', source: 'TechCrunch', time: '1 hour ago', sentiment: 'positive' }
    ],
    quarterly: [
      { quarter: 'Q3 25', revenue: 81800, profit: 19880 },
      { quarter: 'Q4 25', revenue: 89500, profit: 22950 },
      { quarter: 'Q1 26', revenue: 119580, profit: 33920 },
      { quarter: 'Q2 26', revenue: 90750, profit: 23640 }
    ]
  },
  TSLA: {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    exchange: 'NASDAQ • SPL Token',
    category: 'Auto / Autonomous AI',
    price: 215.80,
    change1d: -2.10,
    change1dAmount: -4.63,
    sparkline: [222.0, 220.5, 219.0, 217.4, 218.2, 216.0, 215.8],
    volume24h: '2,94,80,105',
    marketCap: '$68,540Cr',
    peRatio: 62.10,
    pbRatio: 9.80,
    industryPe: 22.40,
    debtToEquity: 0.08,
    roe: 0.18,
    eps: 3.47,
    divYield: 0.00,
    bookValue: 20.15,
    faceValue: 1.0,
    todayLow: 214.20,
    todayHigh: 221.80,
    week52Low: 138.80,
    week52High: 271.00,
    openPrice: 220.40,
    prevClose: 220.43,
    lowerCircuit: 198.38,
    upperCircuit: 242.47,
    pythFeedId: '0x1607a8cb40ff073167a57a55ad7d6f51f496739988b7cb60f1ad9250b73c4d92',
    mintAddress: 'TSLAxTokenMint11111111111111111111111111111',
    sentimentScore: -0.35,
    sentimentLabel: 'Bearish',
    news: [
      { headline: 'EV price cuts compress gross automotive margins in European segment', source: 'Reuters', time: '1 hour ago', sentiment: 'negative' },
      { headline: 'Robotaxi event anticipation drives options volatility', source: 'CNBC', time: '3 hours ago', sentiment: 'neutral' }
    ],
    quarterly: [
      { quarter: 'Q3 25', revenue: 23350, profit: 1850 },
      { quarter: 'Q4 25', revenue: 25170, profit: 2480 },
      { quarter: 'Q1 26', revenue: 21300, profit: 1130 },
      { quarter: 'Q2 26', revenue: 25500, profit: 1480 }
    ]
  },
  MSFT: {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    exchange: 'NASDAQ • SPL Token',
    category: 'Cloud / Enterprise Software',
    price: 432.90,
    change1d: 1.15,
    change1dAmount: 4.92,
    sparkline: [427.0, 429.2, 430.5, 429.8, 431.5, 432.1, 432.9],
    volume24h: '1,42,10,022',
    marketCap: '$3,21,900Cr',
    peRatio: 36.80,
    pbRatio: 12.40,
    industryPe: 34.20,
    debtToEquity: 0.35,
    roe: 0.38,
    eps: 11.80,
    divYield: 0.70,
    bookValue: 34.50,
    faceValue: 1.0,
    todayLow: 428.10,
    todayHigh: 434.50,
    week52Low: 309.45,
    week52High: 468.35,
    openPrice: 429.00,
    prevClose: 427.98,
    lowerCircuit: 385.18,
    upperCircuit: 470.77,
    pythFeedId: '0xd0ca22c317926105f2843efc6291a1a2b2512f4c399738d7f7faea4b1eeea1e1',
    mintAddress: 'MSFTxTokenMint11111111111111111111111111111',
    sentimentScore: 0.70,
    sentimentLabel: 'Bullish',
    news: [
      { headline: 'Azure AI revenue contribution expands to record high', source: 'Forbes', time: '2 hours ago', sentiment: 'positive' },
      { headline: 'Copilot enterprise seat adoption grows across Fortune 500', source: 'ZDNet', time: '4 hours ago', sentiment: 'positive' }
    ],
    quarterly: [
      { quarter: 'Q3 25', revenue: 56520, profit: 22290 },
      { quarter: 'Q4 25', revenue: 62020, profit: 21870 },
      { quarter: 'Q1 26', revenue: 61860, profit: 21940 },
      { quarter: 'Q2 26', revenue: 64730, profit: 22040 }
    ]
  },
  AMZN: {
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    exchange: 'NASDAQ • SPL Token',
    category: 'Cloud / E-Commerce',
    price: 186.20,
    change1d: 0.85,
    change1dAmount: 1.57,
    sparkline: [184.1, 185.0, 184.8, 185.6, 186.0, 185.9, 186.2],
    volume24h: '2,15,30,880',
    marketCap: '$1,94,200Cr',
    peRatio: 44.50,
    pbRatio: 8.60,
    industryPe: 38.00,
    debtToEquity: 0.58,
    roe: 0.21,
    eps: 4.18,
    divYield: 0.00,
    bookValue: 21.60,
    faceValue: 1.0,
    todayLow: 184.00,
    todayHigh: 187.10,
    week52Low: 118.35,
    week52High: 201.20,
    openPrice: 184.80,
    prevClose: 184.63,
    lowerCircuit: 166.16,
    upperCircuit: 203.09,
    pythFeedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    mintAddress: 'AMZNxTokenMint11111111111111111111111111111',
    sentimentScore: 0.65,
    sentimentLabel: 'Bullish',
    news: [
      { headline: 'AWS Bedrock adds custom Anthropic Claude 3.5 Sonnet integrations', source: 'VentureBeat', time: '1 hour ago', sentiment: 'positive' }
    ],
    quarterly: [
      { quarter: 'Q3 25', revenue: 143080, profit: 9880 },
      { quarter: 'Q4 25', revenue: 169960, profit: 10620 },
      { quarter: 'Q1 26', revenue: 143310, profit: 10430 },
      { quarter: 'Q2 26', revenue: 147980, profit: 13480 }
    ]
  }
};

export const TOP_MOVERS = [
  { symbol: 'NVDA', name: 'Nvidia Corp.', price: 124.50, change: 3.82, volume: '3,14,11,934', up: true, sparkline: [118, 120, 122, 124.5] },
  { symbol: 'PLTR', name: 'Palantir Tech', price: 34.50, change: 5.20, volume: '2,40,32,850', up: true, sparkline: [31, 32, 33.5, 34.5] },
  { symbol: 'ARM', name: 'Arm Holdings', price: 138.70, change: 4.10, volume: '97,19,304', up: true, sparkline: [130, 133, 136, 138.7] },
  { symbol: 'COIN', name: 'Coinbase Global', price: 218.40, change: 3.45, volume: '49,91,012', up: true, sparkline: [208, 212, 215, 218.4] },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 215.80, change: -2.10, volume: '2,94,80,105', up: false, sparkline: [222, 219, 217, 215.8] },
  { symbol: 'AAPL', name: 'Apple Inc.', price: 228.15, change: -0.45, volume: '1,82,45,612', up: false, sparkline: [229, 228.5, 228.8, 228.15] }
];

export const TRENDING_SECTORS = [
  { name: 'AI Hyperscalers & Cloud', gainers: 20, losers: 16, change: 5.08, up: true },
  { name: 'DePIN & Telecom Infra', gainers: 17, losers: 8, change: 2.86, up: true },
  { name: 'Clean Energy & Battery Tech', gainers: 5, losers: 4, change: 1.51, up: true },
  { name: 'Real Estate & RWA Vaults', gainers: 78, losers: 103, change: -2.06, up: false },
  { name: 'Semiconductors & Foundry', gainers: 64, losers: 117, change: -2.20, up: false },
  { name: 'Consumer Hardware', gainers: 1, losers: 3, change: -4.63, up: false }
];

export const STOCKS_IN_NEWS = [
  {
    symbol: 'NVDA',
    name: 'Nvidia Corporation',
    change: 3.82,
    headline: 'Nvidia partners with sovereign AI clouds across Asia-Pacific with dedicated H200 clusters.',
    time: '18 minutes ago',
    up: true
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    change: 1.15,
    headline: 'Azure AI enterprise contracts jump 34% QoQ as GitHub Copilot reaches 1.8M paying developers.',
    time: '34 minutes ago',
    up: true
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    change: -2.10,
    headline: 'Full Self-Driving v13 beta rollout begins for employee testing with end-to-end neural network.',
    time: '36 minutes ago',
    up: false
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    change: -0.45,
    headline: 'Apple intelligence server chips enter mass production with TSMC 3nm advanced packaging.',
    time: '52 minutes ago',
    up: false
  }
];

export const TRADING_SCREENS = [
  { title: 'Resistance breakouts', type: 'Bullish', pattern: 'breakout', iconColor: 'text-[#00D09C]' },
  { title: 'MACD above signal line', type: 'Bullish', pattern: 'macd', iconColor: 'text-[#00D09C]' },
  { title: 'RSI overbought (>70)', type: 'Bearish', pattern: 'rsi-overbought', iconColor: 'text-[#EB5B5B]' },
  { title: 'RSI oversold (<30)', type: 'Bullish', pattern: 'rsi-oversold', iconColor: 'text-[#00D09C]' }
];

export const USER_ACTIVE_SIPS: ActiveSIP[] = [
  {
    id: 'sip-mag7',
    name: 'MAG7 Tech Index Basket',
    targetSymbol: 'SOL-MAG7',
    amount: 500,
    frequency: 'Monthly',
    nextDueDate: '19 Sep',
    category: 'Basket',
    totalInvested: 3500,
    currentValue: 4120,
    returnsPercent: 17.71,
    iconBg: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    iconLetter: 'M',
    status: 'Active'
  },
  {
    id: 'sip-ai',
    name: 'AI & Semiconductor Leaders',
    targetSymbol: 'SOL-AI',
    amount: 300,
    frequency: 'Monthly',
    nextDueDate: '19 Sep',
    category: 'Basket',
    totalInvested: 1800,
    currentValue: 2260,
    returnsPercent: 25.55,
    iconBg: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    iconLetter: 'AI',
    status: 'Active'
  },
  {
    id: 'sip-aapl',
    name: 'Apple Inc. Token (AAPLx)',
    targetSymbol: 'AAPL',
    amount: 200,
    frequency: 'Monthly',
    nextDueDate: '19 Oct',
    category: 'Stock',
    totalInvested: 1200,
    currentValue: 1285,
    returnsPercent: 7.08,
    iconBg: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
    iconLetter: 'A',
    status: 'Active'
  },
  {
    id: 'sip-nvda',
    name: 'Nvidia Corp. Token (NVDAx)',
    targetSymbol: 'NVDA',
    amount: 500,
    frequency: 'Monthly',
    nextDueDate: '28 Sep',
    category: 'Stock',
    totalInvested: 2500,
    currentValue: 3120,
    returnsPercent: 24.80,
    iconBg: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    iconLetter: 'N',
    status: 'Active'
  }
];

export const USER_HOLDINGS: PortfolioHolding[] = [
  {
    id: 'hold-1',
    symbol: 'SOL-MAG7',
    name: 'MAG7 Tech Index Basket',
    type: 'Basket',
    shares: 35.5,
    avgPrice: 225.40,
    marketPrice: 248.50,
    investedValue: 8001.70,
    currentValue: 8821.75,
    dayChangeAmount: 124.50,
    dayChangePercent: 1.42,
    totalReturnsAmount: 820.05,
    totalReturnsPercent: 10.25,
    xirr: 18.91,
    sparkline: [225, 230, 238, 242, 248.5]
  },
  {
    id: 'hold-2',
    symbol: 'SOL-AI',
    name: 'AI & Semiconductor Leaders',
    type: 'Basket',
    shares: 20.2,
    avgPrice: 297.00,
    marketPrice: 310.20,
    investedValue: 5999.40,
    currentValue: 6266.04,
    dayChangeAmount: 178.60,
    dayChangePercent: 2.85,
    totalReturnsAmount: 266.64,
    totalReturnsPercent: 4.44,
    xirr: 14.01,
    sparkline: [297, 301, 305, 308, 310.2]
  },
  {
    id: 'hold-3',
    symbol: 'NVDA',
    name: 'Nvidia Corporation',
    type: 'Stock',
    shares: 45.0,
    avgPrice: 115.20,
    marketPrice: 124.50,
    investedValue: 5184.00,
    currentValue: 5602.50,
    dayChangeAmount: 206.10,
    dayChangePercent: 3.82,
    totalReturnsAmount: 418.50,
    totalReturnsPercent: 8.07,
    xirr: 22.45,
    sparkline: [115, 118, 120, 122, 124.5]
  },
  {
    id: 'hold-4',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    type: 'Stock',
    shares: 19.5,
    avgPrice: 221.50,
    marketPrice: 228.15,
    investedValue: 4319.25,
    currentValue: 4448.92,
    dayChangeAmount: -20.10,
    dayChangePercent: -0.45,
    totalReturnsAmount: 129.67,
    totalReturnsPercent: 3.00,
    xirr: 5.65,
    sparkline: [221, 224, 226, 229, 228.15]
  }
];

export const USER_NOTIFICATIONS = [
  { id: 'notif-1', title: 'SIP Executed Successfully', body: '$500 recurring DCA into MAG7 Tech Index filled via Jupiter at $248.50.', time: '2 hours ago', read: false },
  { id: 'notif-2', title: 'Pyth Oracle Alert', body: 'NVDAx 24h volatility exceeded 3.5%. Rebalancing confidence interval updated.', time: '5 hours ago', read: false },
  { id: 'notif-3', title: 'Devnet Airdrop Confirmed', body: 'Received 1,000.00 USDC and 2.0 SOL devnet test funds into your wallet.', time: '1 day ago', read: false },
  { id: 'notif-4', title: 'Quarterly Rebalance Complete', body: 'SOL-MAG7 Basket constituents rebalanced to equal 14.28% weighting.', time: '2 days ago', read: true },
  { id: 'notif-5', title: 'New Pre-IPO Listing', body: 'SpaceX tokenized secondary shares (preSPACEX) are now open for trading.', time: '3 days ago', read: true }
];
