import type { MarketSnapshot } from './markets';

/** Mainnet swap contracts shared by web and mobile. Amounts are decimal strings. */
export interface TradableAsset { mint: string; symbol: string; name: string; decimals: number | null; }
export type TradeSide = 'buy' | 'sell';
export interface MainnetTradeOrder {
  requestId: string;
  transaction: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold?: string;
  slippageBps: number;
  feeBps: number;
  feeMint: string;
  router: string;
  priceImpactPct: number | null;
  expiresAt: number;
  authorization: string;
  taker: string;
  inputSymbol: string;
  outputSymbol: string;
  inputDecimals: number;
  outputDecimals: number;
  side: TradeSide;
}
export interface MainnetTradeResult {
  status: 'Success' | 'Failed' | 'Unknown'; signature?: string; error?: string; totalInputAmount?: string; totalOutputAmount?: string;
}
export const UNKNOWN_TRADE_MESSAGE = 'Confirmation is unknown. This swap may have completed. Check your wallet activity before placing another trade.';

/** A transport error or malformed provider response cannot establish onchain failure. */
export function classifyTradeExecution(value: unknown): MainnetTradeResult {
  if (!value || typeof value !== 'object') return { status: 'Unknown', error: UNKNOWN_TRADE_MESSAGE };
  const result = value as Record<string, unknown>;
  const signature = typeof result.signature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(result.signature) ? result.signature : undefined;
  if (result.status === 'Success' && signature) return {
    status: 'Success', signature,
    totalInputAmount: typeof result.totalInputAmount === 'string' ? result.totalInputAmount : undefined,
    totalOutputAmount: typeof result.totalOutputAmount === 'string' ? result.totalOutputAmount : undefined,
  };
  if (result.status === 'Failed') return { status: 'Failed', signature, error: typeof result.error === 'string' ? result.error : 'The provider reported that the swap failed.' };
  return { status: 'Unknown', signature, error: UNKNOWN_TRADE_MESSAGE };
}

/** Missing issuer catalogs must not turn existing holdings into an apparent zero balance. */
export function hasCompleteIssuerCatalogs(snapshot: Pick<MarketSnapshot, 'sources' | 'status'>): boolean {
  return snapshot.status !== 'unavailable' && ['xStocks issuer catalog', 'PreStocks issuer catalog'].every(source => snapshot.sources.includes(source));
}
export interface MainnetHolding {
  mint: string; symbol: string; name: string; amount: string; displayAmount: string | null;
  priceUsd: number | null; valueUsd: number | null; valuationUnavailableReason: string | null;
}
export interface MainnetPortfolio {
  walletAddress: string; network: 'mainnet-beta'; observedAt: string; solBalance: string; usdcBalance: string;
  holdings: MainnetHolding[]; pricedHoldingsValueUsd: number; hasUnpricedHoldings: boolean;
}
/** Parse without floating point rounding or accepting exponent / negative notation. */
export function toTokenAmount(amount: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('Unsupported token precision.');
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(amount.trim())) throw new Error('Enter a positive decimal amount.');
  const [whole, fraction = ''] = amount.trim().split('.');
  if (fraction.length > decimals) throw new Error(`This token supports up to ${decimals} decimal places.`);
  const value = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (value <= BigInt(0) || value > BigInt('18446744073709551615')) throw new Error('Amount is outside the supported range.');
  return value.toString();
}
export function fromTokenAmount(rawAmount: string, decimals: number): string {
  if (!/^\d+$/.test(rawAmount) || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('Invalid token amount.');
  if (decimals === 0) return rawAmount;
  const value = rawAmount.padStart(decimals + 1, '0');
  return `${value.slice(0, -decimals)}.${value.slice(-decimals)}`.replace(/\.?0+$/, '');
}
export function canApproveTrade(order: MainnetTradeOrder, walletAddress: string | null, now = Date.now()): boolean {
  return Boolean(walletAddress && order.taker === walletAddress && order.transaction && order.expiresAt > now);
}
