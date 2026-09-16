import { MAINNET_USDC_MINT, type MarketSnapshot } from "./markets";

/** Mainnet swap contracts shared by web and mobile. Amounts are decimal strings. */
export interface TradableAsset {
  mint: string;
  symbol: string;
  name: string;
  decimals: number | null;
}
export type TradeSide = "buy" | "sell" | "swap";
export interface SwapToken extends TradableAsset {
  verified: boolean;
  source: "issuer" | "jupiter" | "network" | "wallet";
  logoUrl: string | null;
  priceUsd: number | null;
  tradingHalted: boolean;
}
export const MAINNET_SOL_MINT = "So11111111111111111111111111111111111111112";
export const MAINNET_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
/** Protocol identities only. Prices are never seeded; execution rechecks both mint accounts. */
export const BASE_SWAP_TOKENS: readonly SwapToken[] = [
  {
    mint: MAINNET_SOL_MINT,
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    verified: true,
    source: "network",
    logoUrl: null,
    priceUsd: null,
    tradingHalted: false,
  },
  {
    mint: MAINNET_USDC_MINT,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    verified: true,
    source: "network",
    logoUrl: null,
    priceUsd: null,
    tradingHalted: false,
  },
  {
    mint: MAINNET_USDT_MINT,
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    verified: true,
    source: "network",
    logoUrl: null,
    priceUsd: null,
    tradingHalted: false,
  },
];

/** Normalize real discovery responses without claiming that all indexed tokens are verified. */
export function parseJupiterSwapTokens(value: unknown): SwapToken[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const token = item as Record<string, unknown>;
    if (
      typeof token.id !== "string" ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.id) ||
      typeof token.symbol !== "string" ||
      !token.symbol.trim() ||
      token.symbol.length > 40 ||
      typeof token.name !== "string" ||
      !token.name.trim() ||
      token.name.length > 160 ||
      typeof token.decimals !== "number" ||
      !Number.isInteger(token.decimals) ||
      token.decimals < 0 ||
      token.decimals > 18
    )
      return [];
    return [
      {
        mint: token.id,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        verified: token.isVerified === true,
        source: "jupiter" as const,
        logoUrl:
          typeof token.icon === "string" && token.icon.startsWith("https://")
            ? token.icon
            : null,
        priceUsd:
          typeof token.usdPrice === "number" &&
          Number.isFinite(token.usdPrice) &&
          token.usdPrice > 0
            ? token.usdPrice
            : null,
        tradingHalted: false,
      },
    ];
  });
}
export interface MainnetTradeOrder {
  /** Present on new V1 orders; absent on historical Jupiter orders. */
  transactionVersion?: 0 | 1;
  serializedBytes?: number;
  lastValidBlockHeight?: number;
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
  simulation?: {
    status: "passed";
    simulatedAt: string;
    unitsConsumed: number | null;
  };
}
export const MAX_SWAP_SLIPPAGE_BPS = 300;
export interface MainnetTradeResult {
  status: "Success" | "Failed" | "Unknown";
  signature?: string;
  error?: string;
  totalInputAmount?: string;
  totalOutputAmount?: string;
}
export const UNKNOWN_TRADE_MESSAGE =
  "Confirmation is unknown. This swap may have completed. Check your wallet activity before placing another trade.";

/** A transport error or malformed provider response cannot establish onchain failure. */
export function classifyTradeExecution(value: unknown): MainnetTradeResult {
  if (!value || typeof value !== "object")
    return { status: "Unknown", error: UNKNOWN_TRADE_MESSAGE };
  const result = value as Record<string, unknown>;
  const signature =
    typeof result.signature === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(result.signature)
      ? result.signature
      : undefined;
  if (result.status === "Success" && signature)
    return {
      status: "Success",
      signature,
      totalInputAmount:
        typeof result.totalInputAmount === "string"
          ? result.totalInputAmount
          : undefined,
      totalOutputAmount:
        typeof result.totalOutputAmount === "string"
          ? result.totalOutputAmount
          : undefined,
    };
  if (result.status === "Failed")
    return {
      status: "Failed",
      signature,
      error:
        typeof result.error === "string"
          ? result.error
          : "The provider reported that the swap failed.",
    };
  return { status: "Unknown", signature, error: UNKNOWN_TRADE_MESSAGE };
}

/** Missing issuer catalogs must not turn existing holdings into an apparent zero balance. */
export function hasCompleteIssuerCatalogs(
  snapshot: Pick<MarketSnapshot, "sources" | "status" | "backpackSecurities">,
): boolean {
  return (
    snapshot.status !== "unavailable" &&
    ["xStocks issuer catalog", "PreStocks issuer catalog"].every((source) =>
      snapshot.sources.includes(source),
    ) &&
    // Older persisted snapshots did not include Backpack. New server snapshots
    // must not silently downgrade its known securities into arbitrary tokens.
    (snapshot.backpackSecurities === undefined ||
      ["Backpack securities catalog", "Backpack Solana mappings"].every(
        (source) => snapshot.sources.includes(source),
      ))
  );
}
export interface MainnetHolding {
  mint: string;
  symbol: string;
  name: string;
  amount: string;
  displayAmount: string | null;
  priceUsd: number | null;
  valueUsd: number | null;
  valuationUnavailableReason: string | null;
  /** Balance precision comes from mainnet account data, never a token search result. */
  decimals?: number;
  rawAmount?: string;
  spendableAmount?: string;
  frozenAmount?: string;
  logoUrl?: string | null;
  verified?: boolean;
  source?: SwapToken["source"];
  tradingHalted?: boolean;
  native?: boolean;
  tokenProgram?: string;
  marketAsset?: boolean;
}
export interface MainnetPortfolio {
  walletAddress: string;
  network: "mainnet-beta";
  observedAt: string;
  solBalance: string;
  usdcBalance: string;
  holdings: MainnetHolding[];
  pricedHoldingsValueUsd: number;
  hasUnpricedHoldings: boolean;
  warnings?: string[];
}

export interface OnChainTokenBalance {
  mint: string;
  decimals: number;
  rawAmount: string;
  spendableRawAmount: string;
  displayAmount: string | null;
  tokenProgram: string;
}

/** Aggregate every owner account, including Token-2022 and non-associated accounts.
 * Frozen funds remain visible but cannot be offered by Max. Invalid RPC rows fail
 * closed instead of turning an incompletely parsed wallet into a zero balance.
 */
export function aggregateTokenBalances(
  accounts: readonly unknown[],
  owner: string,
): OnChainTokenBalance[] {
  const balances = new Map<
    string,
    {
      raw: bigint;
      spendable: bigint;
      displayRaw: bigint | null;
      decimals: number;
      tokenProgram: string;
    }
  >();
  const object = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  for (const entry of accounts) {
    const account = object(object(entry).account);
    const parsed = object(object(account.data).parsed);
    const info = object(parsed.info);
    const tokenAmount = object(info.tokenAmount);
    const { amount, decimals } = tokenAmount;
    if (
      parsed.type !== "account" ||
      info.owner !== owner ||
      typeof info.mint !== "string" ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(info.mint) ||
      typeof account.owner !== "string" ||
      ![
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      ].includes(account.owner) ||
      typeof amount !== "string" ||
      !/^\d+$/.test(amount) ||
      BigInt(amount) > BigInt("18446744073709551615") ||
      typeof decimals !== "number" ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 255 ||
      (info.state !== "initialized" && info.state !== "frozen")
    )
      throw new Error(
        "RPC returned an unsupported token account. Wallet balances could not be verified completely.",
      );
    const previous = balances.get(info.mint);
    if (
      previous &&
      (previous.decimals !== decimals ||
        previous.tokenProgram !== account.owner)
    )
      throw new Error("RPC returned inconsistent token balances.");
    let displayRaw: bigint | null = null;
    try {
      if (typeof tokenAmount.uiAmountString === "string")
        displayRaw = /^0(?:\.0+)?$/.test(tokenAmount.uiAmountString)
          ? BigInt(0)
          : BigInt(toTokenAmount(tokenAmount.uiAmountString, decimals));
    } catch {
      /* Scaled balances are unknown when the RPC display precision cannot be preserved. */
    }
    balances.set(info.mint, {
      raw: (previous?.raw ?? BigInt(0)) + BigInt(amount),
      spendable:
        (previous?.spendable ?? BigInt(0)) +
        (info.state === "initialized" ? BigInt(amount) : BigInt(0)),
      displayRaw:
        displayRaw === null || previous?.displayRaw === null
          ? null
          : (previous?.displayRaw ?? BigInt(0)) + displayRaw,
      decimals,
      tokenProgram: account.owner,
    });
  }
  return [...balances]
    .filter(([, balance]) => balance.raw > BigInt(0))
    .map(([mint, balance]) => ({
      mint,
      decimals: balance.decimals,
      rawAmount: balance.raw.toString(),
      spendableRawAmount: balance.spendable.toString(),
      displayAmount:
        balance.displayRaw === null
          ? null
          : fromTokenAmount(balance.displayRaw.toString(), balance.decimals),
      tokenProgram: balance.tokenProgram,
    }));
}

/** A conservative SOL buffer, not a fee quote. The live route still checks fees and rent. */
export const SWAP_SOL_RESERVE_LAMPORTS = "10000000";
export function maxSwapAmount(holding: MainnetHolding | undefined): string {
  if (
    !holding ||
    holding.decimals === undefined ||
    holding.tradingHalted ||
    holding.spendableAmount === undefined ||
    /^0(?:\.0+)?$/.test(holding.spendableAmount)
  )
    return "0";
  try {
    let raw = BigInt(toTokenAmount(holding.spendableAmount, holding.decimals));
    if (holding.mint === MAINNET_SOL_MINT)
      raw -= BigInt(SWAP_SOL_RESERVE_LAMPORTS);
    return raw > BigInt(0)
      ? fromTokenAmount(raw.toString(), holding.decimals)
      : "0";
  } catch {
    return "0";
  }
}

export function holdingToSwapToken(holding: MainnetHolding): SwapToken {
  return {
    mint: holding.mint,
    symbol: holding.symbol,
    name: holding.name,
    decimals: holding.decimals ?? null,
    source: holding.source ?? "wallet",
    verified: holding.verified === true,
    logoUrl: holding.logoUrl ?? null,
    priceUsd: holding.priceUsd,
    tradingHalted: holding.tradingHalted === true,
  };
}
/** Parse without floating point rounding or accepting exponent / negative notation. */
export function toTokenAmount(amount: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error("Unsupported token precision.");
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(amount.trim()))
    throw new Error("Enter a positive decimal amount.");
  const [whole, fraction = ""] = amount.trim().split(".");
  if (fraction.length > decimals)
    throw new Error(`This token supports up to ${decimals} decimal places.`);
  const value = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (value <= BigInt(0) || value > BigInt("18446744073709551615"))
    throw new Error("Amount is outside the supported range.");
  return value.toString();
}
export function fromTokenAmount(rawAmount: string, decimals: number): string {
  if (
    !/^\d+$/.test(rawAmount) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  )
    throw new Error("Invalid token amount.");
  if (decimals === 0) return rawAmount;
  const value = rawAmount.padStart(decimals + 1, "0");
  return `${value.slice(0, -decimals)}.${value.slice(-decimals)}`.replace(
    /\.?0+$/,
    "",
  );
}
export function canApproveTrade(
  order: Pick<MainnetTradeOrder, "taker" | "transaction" | "expiresAt">,
  walletAddress: string | null,
  now = Date.now(),
): boolean {
  return Boolean(
    walletAddress &&
    order.taker === walletAddress &&
    order.transaction &&
    order.expiresAt > now,
  );
}
