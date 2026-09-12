/**
 * Paper Trading Engine for Kite Neo-Brokerage
 * Provides full client-side non-custodial simulated execution on Solana with real market prices.
 */

export interface PaperHolding {
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  isBasket: boolean;
}

export interface PaperOrder {
  id: string;
  timestamp: number;
  type: 'BUY' | 'SELL' | 'SIP_EXEC';
  symbol: string;
  name: string;
  amountUsdc: number;
  shares: number;
  price: number;
  isBasket: boolean;
  status: 'FILLED';
  txHash: string;
}

export interface PaperSip {
  id: string;
  targetSymbol: string;
  targetName: string;
  amountUsdc: number;
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
  nextExecution: string;
  status: 'active' | 'paused';
  totalInvested: number;
  isBasket: boolean;
  cyclesCompleted: number;
}

export interface PaperPortfolioState {
  cashBalance: number;
  holdings: PaperHolding[];
  sips: PaperSip[];
  orders: PaperOrder[];
}

const STORAGE_KEY = 'kite_paper_portfolio_v2';

export const INITIAL_PAPER_STATE: PaperPortfolioState = {
  cashBalance: 38750.00,
  holdings: [
    {
      symbol: 'dAI-TITAN',
      name: 'AI Infrastructure Titans',
      shares: 42.5,
      avgPrice: 108.20,
      isBasket: true,
    },
    {
      symbol: 'xNVDA',
      name: 'Nvidia Corp.',
      shares: 20,
      avgPrice: 204.50,
      isBasket: false,
    },
    {
      symbol: 'xAAPL',
      name: 'Apple Inc.',
      shares: 8,
      avgPrice: 221.00,
      isBasket: false,
    },
  ],
  sips: [
    {
      id: 'sip-nvda',
      targetSymbol: 'xNVDA',
      targetName: 'Nvidia Tokenized Equity',
      amountUsdc: 100,
      frequency: 'weekly',
      nextExecution: 'Next Monday @ 10:00 UTC',
      status: 'active',
      totalInvested: 2400,
      isBasket: false,
      cyclesCompleted: 24,
    },
    {
      id: 'sip-titan',
      targetSymbol: 'dAI-TITAN',
      targetName: 'AI Infrastructure Titans',
      amountUsdc: 250,
      frequency: 'weekly',
      nextExecution: 'Friday @ 14:00 UTC',
      status: 'active',
      totalInvested: 1500,
      isBasket: true,
      cyclesCompleted: 6,
    },
  ],
  orders: [
    {
      id: 'ord-101',
      timestamp: Date.now() - 86400000 * 3,
      type: 'BUY',
      symbol: 'dAI-TITAN',
      name: 'AI Infrastructure Titans',
      amountUsdc: 4598.50,
      shares: 42.5,
      price: 108.20,
      isBasket: true,
      status: 'FILLED',
      txHash: '5K2b...8NxA',
    },
    {
      id: 'ord-102',
      timestamp: Date.now() - 86400000 * 2,
      type: 'BUY',
      symbol: 'xNVDA',
      name: 'Nvidia Corp.',
      amountUsdc: 4090.00,
      shares: 20,
      price: 204.50,
      isBasket: false,
      status: 'FILLED',
      txHash: '3M9q...1LwZ',
    },
    {
      id: 'ord-103',
      timestamp: Date.now() - 86400000,
      type: 'BUY',
      symbol: 'xAAPL',
      name: 'Apple Inc.',
      amountUsdc: 1768.00,
      shares: 8,
      price: 221.00,
      isBasket: false,
      status: 'FILLED',
      txHash: '7P4x...4BqD',
    },
  ],
};

function generateTxHash(): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${result.slice(0, 4)}...${result.slice(4)}`;
}

export function getPaperState(): PaperPortfolioState {
  if (typeof window === 'undefined') return INITIAL_PAPER_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_PAPER_STATE));
      return INITIAL_PAPER_STATE;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_PAPER_STATE;
  }
}

export function savePaperState(state: PaperPortfolioState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('kite_paper_update'));
  } catch (err) {
    console.error('Failed to save paper state', err);
  }
}

export function executePaperBuy(
  symbol: string,
  name: string,
  amountUsdc: number,
  currentPrice: number,
  isBasket: boolean
): { success: boolean; message: string } {
  const state = getPaperState();
  if (amountUsdc <= 0) return { success: false, message: 'Enter a valid investment amount.' };
  if (state.cashBalance < amountUsdc) {
    return { success: false, message: `Insufficient paper balance ($${state.cashBalance.toFixed(2)} USDC available).` };
  }

  const effectivePrice = currentPrice > 0 ? currentPrice : 100;
  const sharesReceived = Number((amountUsdc / effectivePrice).toFixed(4));

  state.cashBalance = Number((state.cashBalance - amountUsdc).toFixed(2));

  // Update or append holding
  const existingIdx = state.holdings.findIndex((h) => h.symbol.toUpperCase() === symbol.toUpperCase());
  if (existingIdx >= 0) {
    const prev = state.holdings[existingIdx];
    const totalCost = prev.shares * prev.avgPrice + amountUsdc;
    const newShares = prev.shares + sharesReceived;
    state.holdings[existingIdx] = {
      ...prev,
      shares: Number(newShares.toFixed(4)),
      avgPrice: Number((totalCost / newShares).toFixed(2)),
    };
  } else {
    state.holdings.push({
      symbol,
      name,
      shares: sharesReceived,
      avgPrice: Number(effectivePrice.toFixed(2)),
      isBasket,
    });
  }

  // Record order in ledger
  state.orders.unshift({
    id: `ord-${Date.now().toString(36)}`,
    timestamp: Date.now(),
    type: 'BUY',
    symbol,
    name,
    amountUsdc,
    shares: sharesReceived,
    price: effectivePrice,
    isBasket,
    status: 'FILLED',
    txHash: generateTxHash(),
  });

  savePaperState(state);
  return {
    success: true,
    message: `Filled order for ${sharesReceived} ${symbol} at $${effectivePrice.toFixed(2)} (${amountUsdc} USDC allocated).`,
  };
}

export function executePaperSell(
  symbol: string,
  sharesToSell: number,
  currentPrice: number
): { success: boolean; message: string } {
  const state = getPaperState();
  const existingIdx = state.holdings.findIndex((h) => h.symbol.toUpperCase() === symbol.toUpperCase());
  if (existingIdx < 0) return { success: false, message: 'Position not found in portfolio.' };

  const holding = state.holdings[existingIdx];
  if (sharesToSell <= 0 || sharesToSell > holding.shares) {
    return { success: false, message: `Invalid share quantity (Max: ${holding.shares}).` };
  }

  const effectivePrice = currentPrice > 0 ? currentPrice : holding.avgPrice;
  const proceeds = Number((sharesToSell * effectivePrice).toFixed(2));

  state.cashBalance = Number((state.cashBalance + proceeds).toFixed(2));

  if (sharesToSell >= holding.shares) {
    state.holdings.splice(existingIdx, 1);
  } else {
    state.holdings[existingIdx].shares = Number((holding.shares - sharesToSell).toFixed(4));
  }

  state.orders.unshift({
    id: `ord-${Date.now().toString(36)}`,
    timestamp: Date.now(),
    type: 'SELL',
    symbol: holding.symbol,
    name: holding.name,
    amountUsdc: proceeds,
    shares: sharesToSell,
    price: effectivePrice,
    isBasket: holding.isBasket,
    status: 'FILLED',
    txHash: generateTxHash(),
  });

  savePaperState(state);
  return {
    success: true,
    message: `Sold ${sharesToSell} ${symbol} for $${proceeds.toFixed(2)} USDC.`,
  };
}

export function createPaperSip(
  targetSymbol: string,
  targetName: string,
  amountUsdc: number,
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly',
  isBasket: boolean
): { success: boolean; message: string } {
  const state = getPaperState();
  if (amountUsdc <= 0) return { success: false, message: 'Enter a valid SIP amount.' };

  const id = `sip-${Date.now().toString(36)}`;
  state.sips.push({
    id,
    targetSymbol,
    targetName,
    amountUsdc,
    frequency,
    nextExecution: `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} execution active`,
    status: 'active',
    totalInvested: 0,
    isBasket,
    cyclesCompleted: 0,
  });

  savePaperState(state);
  return {
    success: true,
    message: `Activated ${frequency} SIP for $${amountUsdc} USDC into ${targetSymbol}!`,
  };
}

export function togglePaperSip(id: string) {
  const state = getPaperState();
  const target = state.sips.find((s) => s.id === id);
  if (target) {
    target.status = target.status === 'active' ? 'paused' : 'active';
    savePaperState(state);
  }
}

export function executeSipCycleNow(
  id: string,
  currentPrice: number
): { success: boolean; message: string } {
  const state = getPaperState();
  const target = state.sips.find((s) => s.id === id);
  if (!target) return { success: false, message: 'SIP Schedule not found.' };

  if (state.cashBalance < target.amountUsdc) {
    return { success: false, message: `Insufficient paper balance ($${state.cashBalance.toFixed(2)} USDC).` };
  }

  const effectivePrice = currentPrice > 0 ? currentPrice : 100;
  const sharesReceived = Number((target.amountUsdc / effectivePrice).toFixed(4));

  state.cashBalance = Number((state.cashBalance - target.amountUsdc).toFixed(2));
  target.totalInvested += target.amountUsdc;
  target.cyclesCompleted += 1;

  // Add to holdings
  const existingIdx = state.holdings.findIndex((h) => h.symbol.toUpperCase() === target.targetSymbol.toUpperCase());
  if (existingIdx >= 0) {
    const prev = state.holdings[existingIdx];
    const totalCost = prev.shares * prev.avgPrice + target.amountUsdc;
    const newShares = prev.shares + sharesReceived;
    state.holdings[existingIdx] = {
      ...prev,
      shares: Number(newShares.toFixed(4)),
      avgPrice: Number((totalCost / newShares).toFixed(2)),
    };
  } else {
    state.holdings.push({
      symbol: target.targetSymbol,
      name: target.targetName,
      shares: sharesReceived,
      avgPrice: effectivePrice,
      isBasket: target.isBasket,
    });
  }

  state.orders.unshift({
    id: `ord-${Date.now().toString(36)}`,
    timestamp: Date.now(),
    type: 'SIP_EXEC',
    symbol: target.targetSymbol,
    name: target.targetName,
    amountUsdc: target.amountUsdc,
    shares: sharesReceived,
    price: effectivePrice,
    isBasket: target.isBasket,
    status: 'FILLED',
    txHash: generateTxHash(),
  });

  savePaperState(state);
  return {
    success: true,
    message: `Executed DCA cycle! Minted ${sharesReceived} ${target.targetSymbol} for $${target.amountUsdc} USDC.`,
  };
}

export function resetPaperPortfolio(): PaperPortfolioState {
  const fresh: PaperPortfolioState = {
    cashBalance: 50000.00,
    holdings: [],
    sips: [],
    orders: [],
  };
  savePaperState(fresh);
  return fresh;
}
