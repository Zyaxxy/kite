import type { MarketAsset, MarketBasket, MarketSnapshot } from './markets';

export interface PaperPosition { mint: string; symbol: string; quantity: number; costBasisUsd: number; }
export interface PaperOrder { id: string; mint: string; symbol: string; side: 'buy' | 'sell'; quantity: number; priceUsd: number; totalUsd: number; createdAt: string; swapId?: string; realizedPnlUsd?: number; }
export interface PaperSwapQuote { inputMint: string; outputMint: string; inputQuantity: number; outputQuantity: number; inputPriceUsd: number; outputPriceUsd: number; valueUsd: number; quotedAt: string; }
export type PaperFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export interface PaperPlan { id: string; targetId: string; targetType: 'asset' | 'basket'; name: string; amountUsd: number; frequency: PaperFrequency; active: boolean; nextExecutionAt: string; createdAt: string; lastError: string | null; }
export interface PaperAccount { version: 1; cashUsd: number; startingCashUsd: number; positions: PaperPosition[]; orders: PaperOrder[]; plans: PaperPlan[]; }
export interface PaperValuation { cashUsd: number; holdingsUsd: number | null; totalUsd: number | null; equityUsd: number | null; profitLossUsd: number | null; profitLossPct: number | null; unpricedMints: string[]; }

/** Persisted paper state is untrusted. Reject corrupt state instead of silently minting virtual cash. */
export function parsePaperAccount(value: unknown): PaperAccount | null {
  if (!value || typeof value !== 'object') return null;
  const account = value as Record<string, unknown>;
  const record = (item: unknown): Record<string, unknown> => item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const positive = (item: unknown): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0;
  const nonnegative = (item: unknown): item is number => typeof item === 'number' && Number.isFinite(item) && item >= 0;
  const text = (item: unknown): item is string => typeof item === 'string' && item.length > 0 && item.length <= 250;
  const date = (item: unknown): item is string => text(item) && Number.isFinite(Date.parse(item));
  if (account.version !== 1 || !nonnegative(account.cashUsd) || !positive(account.startingCashUsd) || !Array.isArray(account.positions) || !Array.isArray(account.orders)) return null;
  const plans = account.plans ?? [];
  if (!Array.isArray(plans) || account.positions.length > 10_000 || account.orders.length > 100_000 || plans.length > 1_000) return null;
  if (!account.positions.every(item => { const p = record(item); return text(p.mint) && text(p.symbol) && positive(p.quantity) && nonnegative(p.costBasisUsd); })) return null;
  if (new Set(account.positions.map(item => record(item).mint)).size !== account.positions.length) return null;
  if (!account.orders.every(item => { const o = record(item); return text(o.id) && text(o.mint) && text(o.symbol) && (o.side === 'buy' || o.side === 'sell') && positive(o.quantity) && positive(o.priceUsd) && positive(o.totalUsd) && date(o.createdAt) && (o.swapId === undefined || text(o.swapId)) && (o.realizedPnlUsd === undefined || (typeof o.realizedPnlUsd === 'number' && Number.isFinite(o.realizedPnlUsd))); })) return null;
  if (!plans.every(item => { const p = record(item); return text(p.id) && text(p.targetId) && (p.targetType === 'asset' || p.targetType === 'basket') && text(p.name) && positive(p.amountUsd) && ['daily','weekly','biweekly','monthly'].includes(String(p.frequency)) && typeof p.active === 'boolean' && date(p.nextExecutionAt) && date(p.createdAt) && (p.lastError === null || text(p.lastError)); })) return null;
  return { version: 1, cashUsd: account.cashUsd, startingCashUsd: account.startingCashUsd, positions: account.positions as PaperPosition[], orders: account.orders as PaperOrder[], plans: plans as PaperPlan[] };
}

export function createPaperAccount(startingCashUsd = 10_000): PaperAccount {
  if (!Number.isFinite(startingCashUsd) || startingCashUsd <= 0 || startingCashUsd > 1_000_000_000) throw new Error('Enter a valid virtual starting balance.');
  return { version: 1, cashUsd: startingCashUsd, startingCashUsd, positions: [], orders: [], plans: [] };
}

function paperAssetPrice(asset: MarketAsset, now: string): number {
  if (!asset.verified || asset.tradingHalted) throw new Error('This asset is unavailable for trading.');
  if (asset.priceUsd === null || !Number.isFinite(asset.priceUsd) || asset.priceUsd <= 0) throw new Error('A live market price is required.');
  const age = new Date(now).getTime() - new Date(asset.priceObservedAt ?? '').getTime();
  if (!Number.isFinite(age) || age < -30_000 || age > 120_000) throw new Error('Refresh market prices before placing an order.');
  return asset.priceUsd;
}

export function executePaperOrder(account: PaperAccount, asset: MarketAsset, side: 'buy' | 'sell', amountUsd: number, now = new Date().toISOString()): PaperAccount {
  if (side !== 'buy' && side !== 'sell') throw new Error('Invalid order side.');
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('Enter an amount greater than zero.');
  const priceUsd = paperAssetPrice(asset, now);
  const quantity = amountUsd / priceUsd;
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Order quantity is outside the supported range.');
  const existing = account.positions.find(position => position.mint === asset.mint);
  if (side === 'buy' && amountUsd > account.cashUsd + 1e-8) throw new Error('Insufficient paper buying power.');
  if (side === 'sell' && (!existing || quantity > existing.quantity + 1e-10)) throw new Error('Insufficient paper holdings.');
  const positions = account.positions.filter(position => position.mint !== asset.mint);
  const nextQuantity = (existing?.quantity ?? 0) + (side === 'buy' ? quantity : -quantity);
  const costBasisUsd = side === 'buy' ? (existing?.costBasisUsd ?? 0) + amountUsd : (existing?.costBasisUsd ?? 0) * (nextQuantity / (existing?.quantity ?? 1));
  if (nextQuantity > 1e-10) positions.push({ mint: asset.mint, symbol: asset.symbol, quantity: nextQuantity, costBasisUsd });
  const order: PaperOrder = { id: `${now}-${account.orders.length + 1}-${asset.mint.slice(0,6)}`, mint: asset.mint, symbol: asset.symbol, side, quantity, priceUsd, totalUsd: amountUsd, createdAt: now, ...(side === 'sell' ? { realizedPnlUsd: amountUsd - ((existing?.costBasisUsd ?? 0) - costBasisUsd) } : {}) };
  return { ...account, positions, cashUsd: Math.max(0, account.cashUsd + (side === 'buy' ? -amountUsd : amountUsd)), orders: [order, ...account.orders] };
}

/** A paper quote uses observed prices on both sides and only units already held. */
export function quotePaperSwap(account: PaperAccount, inputAsset: MarketAsset, outputAsset: MarketAsset, quantity: number, now = new Date().toISOString()): PaperSwapQuote {
  if (inputAsset.mint === outputAsset.mint) throw new Error('Choose two different assets to swap.');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Enter a quantity greater than zero.');
  const inputPriceUsd = paperAssetPrice(inputAsset, now);
  const outputPriceUsd = paperAssetPrice(outputAsset, now);
  const holding = account.positions.find(position => position.mint === inputAsset.mint);
  if (!holding || !Number.isFinite(holding.quantity) || quantity > holding.quantity) throw new Error('Insufficient paper holdings.');
  const valueUsd = quantity * inputPriceUsd;
  const outputQuantity = valueUsd / outputPriceUsd;
  if (!Number.isFinite(valueUsd) || valueUsd <= 0 || !Number.isFinite(outputQuantity) || outputQuantity <= 0) throw new Error('Swap quantity is outside the supported range.');
  return { inputMint: inputAsset.mint, outputMint: outputAsset.mint, inputQuantity: quantity, outputQuantity, inputPriceUsd, outputPriceUsd, valueUsd, quotedAt: now };
}

/** Commit both ledger legs together. The virtual cash balance is unchanged, including rounding. */
export function executePaperSwap(account: PaperAccount, inputAsset: MarketAsset, outputAsset: MarketAsset, quantity: number, now = new Date().toISOString()): PaperAccount {
  const quote = quotePaperSwap(account, inputAsset, outputAsset, quantity, now);
  const inputPosition = account.positions.find(position => position.mint === inputAsset.mint)!;
  const outputPosition = account.positions.find(position => position.mint === outputAsset.mint);
  const remainingQuantity = inputPosition.quantity - quantity;
  const remainingCost = inputPosition.costBasisUsd * (remainingQuantity / inputPosition.quantity);
  const outputQuantity = (outputPosition?.quantity ?? 0) + quote.outputQuantity;
  const outputCost = (outputPosition?.costBasisUsd ?? 0) + quote.valueUsd;
  const realizedPnlUsd = quote.valueUsd - (inputPosition.costBasisUsd - remainingCost);
  if (![remainingCost, outputQuantity, outputCost, realizedPnlUsd].every(Number.isFinite) || outputQuantity <= 0 || remainingCost < 0 || outputCost < 0) throw new Error('Swap quantity is outside the supported range.');
  const positions = account.positions.filter(position => position.mint !== inputAsset.mint && position.mint !== outputAsset.mint);
  if (remainingQuantity > 0) positions.push({ ...inputPosition, quantity: remainingQuantity, costBasisUsd: remainingCost });
  positions.push({ mint: outputAsset.mint, symbol: outputAsset.symbol, quantity: outputQuantity, costBasisUsd: outputCost });
  const swapId = `swap-${now}-${account.orders.length + 1}`;
  const sell: PaperOrder = { id: `${swapId}-sell`, swapId, mint: inputAsset.mint, symbol: inputAsset.symbol, side: 'sell', quantity, priceUsd: quote.inputPriceUsd, totalUsd: quote.valueUsd, realizedPnlUsd, createdAt: now };
  const buy: PaperOrder = { id: `${swapId}-buy`, swapId, mint: outputAsset.mint, symbol: outputAsset.symbol, side: 'buy', quantity: quote.outputQuantity, priceUsd: quote.outputPriceUsd, totalUsd: quote.valueUsd, createdAt: now };
  return { ...account, positions, orders: [buy, sell, ...account.orders] };
}

export function executePaperBasket(account: PaperAccount, basket: MarketBasket, amountUsd: number, now = new Date().toISOString()): PaperAccount {
  if (!basket.available || basket.assets.reduce((sum,item) => sum + item.weight, 0) !== 10_000) throw new Error('All basket assets must be available and allocations must total 100%.');
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > account.cashUsd) throw new Error('Enter an amount within your paper buying power.');
  return basket.assets.reduce((next, item) => executePaperOrder(next, item.asset, 'buy', amountUsd * item.weight / 10_000, now), account);
}

export function valuePaperAccount(account: PaperAccount, assets: MarketAsset[]): PaperValuation {
  const byMint = new Map(assets.map(asset => [asset.mint, asset]));
  const unpricedMints = account.positions.filter(position => {
    const price = byMint.get(position.mint)?.priceUsd;
    return price == null || !Number.isFinite(price) || price <= 0;
  }).map(position => position.mint);
  const holdingsUsd = unpricedMints.length ? null : account.positions.reduce((sum, position) => sum + position.quantity * (byMint.get(position.mint)?.priceUsd ?? 0), 0);
  const totalUsd = holdingsUsd === null ? null : account.cashUsd + holdingsUsd;
  const profitLossUsd = totalUsd === null ? null : totalUsd - account.startingCashUsd;
  return { cashUsd: account.cashUsd, holdingsUsd, totalUsd, equityUsd: totalUsd, profitLossUsd, profitLossPct: profitLossUsd === null ? null : profitLossUsd / account.startingCashUsd * 100, unpricedMints };
}

export function nextPaperExecution(frequency: PaperFrequency, from: string): string {
  if (!['daily','weekly','biweekly','monthly'].includes(frequency)) throw new Error('Invalid plan frequency.');
  const date = new Date(from);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid plan date.');
  if (frequency === 'monthly') {
    const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 0)).getUTCDate(); date.setUTCDate(Math.min(day,last));
  } else date.setUTCDate(date.getUTCDate() + ({ daily: 1, weekly: 7, biweekly: 14 }[frequency]));
  return date.toISOString();
}

export function createPaperPlan(account: PaperAccount, input: Pick<PaperPlan, 'targetId' | 'targetType' | 'name' | 'amountUsd' | 'frequency'>, now = new Date().toISOString()): PaperAccount {
  if (!input.targetId?.trim() || !input.name?.trim() || !['asset','basket'].includes(input.targetType)) throw new Error('Choose a valid asset or basket for the plan.');
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) throw new Error('Enter a valid recurring amount.');
  const plan: PaperPlan = { ...input, id: `plan-${now}-${account.plans.length + 1}`, active: true, createdAt: now, nextExecutionAt: nextPaperExecution(input.frequency, now), lastError: null };
  return { ...account, plans: [...account.plans, plan] };
}

export function togglePaperPlan(account: PaperAccount, planId: string): PaperAccount {
  return { ...account, plans: account.plans.map(plan => plan.id === planId ? { ...plan, active: !plan.active, lastError: null } : plan) };
}

/** Runs at most one due installment per plan when the app is open. Never fabricates backdated fills. */
export function runDuePaperPlans(account: PaperAccount, snapshot: MarketSnapshot, now = new Date().toISOString()): PaperAccount {
  let next = account;
  for (const plan of account.plans) {
    if (!plan.active || new Date(plan.nextExecutionAt).getTime() > new Date(now).getTime()) continue;
    try {
      if (plan.targetType === 'basket') {
        const basket = snapshot.baskets.find(item => item.id === plan.targetId);
        if (!basket) throw new Error('Basket is unavailable.');
        next = executePaperBasket(next, basket, plan.amountUsd, now);
      } else {
        const asset = snapshot.assets.find(item => item.mint === plan.targetId);
        if (!asset) throw new Error('Asset is unavailable.');
        next = executePaperOrder(next, asset, 'buy', plan.amountUsd, now);
      }
      next = { ...next, plans: next.plans.map(item => item.id === plan.id ? { ...item, nextExecutionAt: nextPaperExecution(item.frequency, now), lastError: null } : item) };
    } catch (error) {
      next = { ...next, plans: next.plans.map(item => item.id === plan.id ? { ...item, lastError: error instanceof Error ? error.message : 'Plan could not execute.' } : item) };
    }
  }
  return next;
}
