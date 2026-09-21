import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  aggregateTokenBalances,
  BASE_SWAP_TOKENS,
  fromTokenAmount,
  MAINNET_SOL_MINT,
  MAINNET_USDC_MINT,
  parseJupiterSwapTokens,
  hasCompleteIssuerCatalogs,
  type MainnetHolding,
  type MainnetPortfolio,
  type SwapToken,
} from "@kite/sdk";
import { getServerMarketCatalog } from "./markets";

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const metadata = new Map<
  string,
  { token: SwapToken | null; expiresAt: number }
>();
const pending = new Map<string, Promise<MainnetPortfolio>>();
let verifiedRpc: { endpoint: string; expiresAt: number } | null = null;

async function walletMetadata(
  mints: string[],
): Promise<{ tokens: Map<string, SwapToken>; partial: boolean }> {
  const tokens = new Map<string, SwapToken>();
  const missing = mints.filter((mint) => {
    const entry = metadata.get(mint);
    if (!entry || entry.expiresAt <= Date.now()) return true;
    if (entry.token) tokens.set(mint, entry.token);
    return false;
  });
  // Tokens V2 accepts up to 100 mint addresses. Fetch every batch with bounded
  // concurrency and one overall deadline; a metadata outage never hides funds.
  const batches: string[][] = [];
  for (let offset = 0; offset < missing.length; offset += 100)
    batches.push(missing.slice(offset, offset + 100));
  const signal = AbortSignal.timeout(6_000);
  let index = 0;
  let partial = false;
  await Promise.all(
    Array.from({ length: Math.min(3, batches.length) }, async () => {
      while (index < batches.length && !signal.aborted) {
        const batch = batches[index++];
        try {
          const apiKey = process.env.JUPITER_API_KEY?.split(",")[0]?.trim();
          const response = await fetch(
            `https://api.jup.ag/tokens/v2/search?${new URLSearchParams({ query: batch.join(",") })}`,
            {
              headers: apiKey ? { "x-api-key": apiKey } : {},
              cache: "no-store",
              signal,
            },
          );
          if (!response.ok) throw new Error("Metadata unavailable");
          const payload: unknown = await response.json();
          if (!Array.isArray(payload)) throw new Error("Metadata unavailable");
          const found = new Map(
            parseJupiterSwapTokens(payload)
              .filter((token) => batch.includes(token.mint))
              .map((token) => [token.mint, token]),
          );
          for (const mint of batch) {
            const token = found.get(mint) ?? null;
            if (token) tokens.set(mint, token);
            if (metadata.size >= 2_000)
              metadata.delete(metadata.keys().next().value!);
            metadata.set(mint, {
              token,
              expiresAt: Date.now() + (token ? 60_000 : 15_000),
            });
          }
        } catch {
          partial = true;
        }
      }
    }),
  );
  return { tokens, partial: partial || index < batches.length };
}

export function getWalletPortfolio(address: string): Promise<MainnetPortfolio> {
  const active = pending.get(address);
  if (active) return active;
  const task = readWalletPortfolio(address).finally(() =>
    pending.delete(address),
  );
  pending.set(address, task);
  return task;
}

async function readWalletPortfolio(address: string): Promise<MainnetPortfolio> {
  const wallet = new PublicKey(address);
  const endpoint =
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com";
  const deadline = AbortSignal.timeout(15_000);
  const connection = new Connection(endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
    fetch: (input, init) => fetch(input, { ...init, signal: deadline }),
  });
  if (
    !verifiedRpc ||
    verifiedRpc.endpoint !== endpoint ||
    verifiedRpc.expiresAt <= Date.now()
  ) {
    if ((await connection.getGenesisHash()) !== MAINNET_GENESIS)
      throw new Error("Mainnet RPC required");
    verifiedRpc = { endpoint, expiresAt: Date.now() + 5 * 60_000 };
  }
  const catalogTask = getServerMarketCatalog().catch(() => null);
  const [legacy, token2022, lamports] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(wallet, {
      programId: TOKEN_PROGRAM_ID,
    }),
    connection.getParsedTokenAccountsByOwner(wallet, {
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    connection.getBalance(wallet),
  ]);
  if (!Number.isSafeInteger(lamports) || lamports < 0)
    throw new Error("SOL balance precision unavailable");
  const accounts = [...legacy.value, ...token2022.value].map((entry) => ({
    account: { ...entry.account, owner: entry.account.owner.toBase58() },
  }));
  const balances = aggregateTokenBalances(accounts, address);
  const observedAt = new Date().toISOString();
  const [discovery, catalog] = await Promise.all([
    walletMetadata([
      ...new Set([
        MAINNET_SOL_MINT,
        ...balances.map((balance) => balance.mint),
      ]),
    ]),
    catalogTask,
  ]);
  const warnings: string[] = [];
  const completeCatalog =
    catalog !== null && hasCompleteIssuerCatalogs(catalog);
  if (!completeCatalog)
    warnings.push(
      "Issuer metadata is incomplete. Every wallet balance is included; some token identities and valuations are unavailable.",
    );
  if (discovery.partial)
    warnings.push(
      "Some token details are unavailable. Balances were read directly from Solana mainnet.",
    );
  const issuerAssets = new Map(
    catalog?.assets.map((asset) => [asset.mint, asset]) ?? [],
  );
  const holdings: MainnetHolding[] = balances
    .filter((balance) => balance.mint !== MAINNET_SOL_MINT)
    .map((balance) => {
      const asset = issuerAssets.get(balance.mint);
      const base = BASE_SWAP_TOKENS.find(
        (token) => token.mint === balance.mint,
      );
      const token = discovery.tokens.get(balance.mint);
      const amount = fromTokenAmount(balance.rawAmount, balance.decimals);
      const scaled =
        balance.displayAmount === null || balance.displayAmount !== amount;
      const unknownBasis =
        asset?.issuer === "xstocks" ||
        scaled ||
        (!completeCatalog && !base) ||
        (token !== undefined && token.decimals !== balance.decimals);
      const priceUsd = unknownBasis
        ? null
        : (token?.priceUsd ?? asset?.priceUsd ?? null);
      const value = priceUsd === null ? null : Number(amount) * priceUsd;
      return {
        mint: balance.mint,
        symbol:
          asset?.symbol ??
          base?.symbol ??
          token?.symbol ??
          `${balance.mint.slice(0, 4)}…${balance.mint.slice(-4)}`,
        name:
          asset?.name ??
          base?.name ??
          token?.name ??
          "Unidentified wallet token",
        amount,
        displayAmount: balance.displayAmount,
        decimals: balance.decimals,
        rawAmount: balance.rawAmount,
        spendableAmount: fromTokenAmount(
          balance.spendableRawAmount,
          balance.decimals,
        ),
        frozenAmount: fromTokenAmount(
          (
            BigInt(balance.rawAmount) - BigInt(balance.spendableRawAmount)
          ).toString(),
          balance.decimals,
        ),
        logoUrl: asset?.logoUrl ?? token?.logoUrl ?? null,
        source: asset
          ? "issuer"
          : base
            ? "network"
            : token
              ? "jupiter"
              : "wallet",
        verified: asset?.verified ?? base?.verified ?? token?.verified ?? false,
        tradingHalted: asset?.tradingHalted ?? false,
        tokenProgram: balance.tokenProgram,
        native: false,
        marketAsset: Boolean(asset),
        priceUsd,
        valueUsd: value !== null && Number.isFinite(value) ? value : null,
        valuationUnavailableReason: unknownBasis
          ? "The price feed’s corporate-action adjustment basis is not verified."
          : priceUsd === null
            ? "No current token price is available."
            : null,
      };
    });
  const wrapped = balances.find((balance) => balance.mint === MAINNET_SOL_MINT);
  if (wrapped && wrapped.decimals !== 9)
    throw new Error("Wrapped SOL precision is inconsistent.");
  const solRaw = BigInt(lamports) + BigInt(wrapped?.rawAmount ?? "0");
  if (solRaw > BigInt(0)) {
    const token = discovery.tokens.get(MAINNET_SOL_MINT);
    const amount = fromTokenAmount(solRaw.toString(), 9);
    const priceUsd = token?.priceUsd ?? null;
    const value = priceUsd === null ? null : Number(amount) * priceUsd;
    holdings.push({
      mint: MAINNET_SOL_MINT,
      symbol: "SOL",
      name: "Solana",
      decimals: 9,
      rawAmount: solRaw.toString(),
      amount,
      displayAmount: amount,
      spendableAmount: fromTokenAmount(
        (
          BigInt(lamports) + BigInt(wrapped?.spendableRawAmount ?? "0")
        ).toString(),
        9,
      ),
      frozenAmount: fromTokenAmount(
        (
          BigInt(wrapped?.rawAmount ?? "0") -
          BigInt(wrapped?.spendableRawAmount ?? "0")
        ).toString(),
        9,
      ),
      priceUsd,
      valueUsd: value !== null && Number.isFinite(value) ? value : null,
      logoUrl: token?.logoUrl ?? null,
      source: "network",
      verified: true,
      tradingHalted: false,
      native: true,
      marketAsset: false,
      valuationUnavailableReason:
        priceUsd === null ? "No current token price is available." : null,
    });
  }
  holdings.sort(
    (a, b) =>
      (b.valueUsd ?? -1) - (a.valueUsd ?? -1) ||
      a.symbol.localeCompare(b.symbol),
  );
  return {
    walletAddress: address,
    network: "mainnet-beta",
    observedAt,
    solBalance: fromTokenAmount(lamports.toString(), 9),
    usdcBalance:
      holdings.find((holding) => holding.mint === MAINNET_USDC_MINT)?.amount ??
      "0",
    holdings,
    pricedHoldingsValueUsd: holdings.reduce(
      (sum, holding) => sum + (holding.valueUsd ?? 0),
      0,
    ),
    hasUnpricedHoldings: holdings.some((holding) => holding.valueUsd === null),
    warnings,
  };
}
