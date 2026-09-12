import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  MAINNET_USDC_MINT,
  fromTokenAmount,
  toTokenAmount,
  hasCompleteIssuerCatalogs,
  type MainnetHolding,
  type MainnetPortfolio,
} from "@kite/sdk";
import { getServerMarkets } from "@/lib/server/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("wallet");
  if (!address)
    return NextResponse.json(
      { error: "A wallet address is required." },
      { status: 400 },
    );
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(address);
  } catch {
    return NextResponse.json(
      { error: "Invalid wallet address." },
      { status: 400 },
    );
  }
  try {
    const endpoint =
      process.env.SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.mainnet-beta.solana.com";
    const connection = new Connection(endpoint, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
    });
    const genesis = await connection.getGenesisHash();
    if (genesis !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d")
      return NextResponse.json(
        {
          error:
            "The configured RPC is not Solana mainnet. Portfolio balances are unavailable.",
        },
        { status: 503 },
      );
    const [legacy, token2022, lamports, markets] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(wallet, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      connection.getBalance(wallet),
      getServerMarkets(),
    ]);
    if (!hasCompleteIssuerCatalogs(markets))
      return NextResponse.json(
        {
          error:
            "An issuer catalog is unavailable. Your complete tokenized holdings cannot be identified yet; balances have not been assumed to be zero.",
        },
        { status: 503 },
      );
    const balances = new Map<
      string,
      { raw: bigint; displayRaw: bigint | null; decimals: number }
    >();
    for (const token of [...legacy.value, ...token2022.value]) {
      const info = token.account.data.parsed.info as {
        mint?: unknown;
        tokenAmount?: {
          amount?: unknown;
          decimals?: unknown;
          uiAmountString?: unknown;
        };
      };
      const raw = info.tokenAmount?.amount;
      const decimals = info.tokenAmount?.decimals;
      if (
        typeof info.mint !== "string" ||
        typeof raw !== "string" ||
        !/^\d+$/.test(raw) ||
        typeof decimals !== "number" ||
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        decimals > 18
      )
        continue;
      const previous = balances.get(info.mint);
      if (previous && previous.decimals !== decimals)
        throw new Error("RPC returned inconsistent token balances.");
      let displayRaw: bigint | null = null;
      try {
        const display = info.tokenAmount?.uiAmountString;
        if (typeof display === "string")
          displayRaw = /^0(?:\.0+)?$/.test(display)
            ? BigInt(0)
            : BigInt(toTokenAmount(display, decimals));
      } catch {
        /* An unavailable display amount must not be replaced with unscaled shares. */
      }
      balances.set(info.mint, {
        raw: (previous?.raw ?? BigInt(0)) + BigInt(raw),
        displayRaw:
          displayRaw === null || previous?.displayRaw === null
            ? null
            : (previous?.displayRaw ?? BigInt(0)) + displayRaw,
        decimals,
      });
    }
    const holdings: MainnetHolding[] = markets.assets.flatMap((asset) => {
      const balance = balances.get(asset.mint);
      if (!balance || balance.raw <= BigInt(0)) return [];
      const amount = fromTokenAmount(balance.raw.toString(), balance.decimals);
      const displayAmount =
        balance.displayRaw === null
          ? null
          : fromTokenAmount(balance.displayRaw.toString(), balance.decimals);
      // Tokens V2 does not document the price basis for scaled xStocks. Do not mix raw and scaled units.
      const priceBasisUnknown =
        asset.issuer === "xstocks" ||
        (displayAmount !== null && Number(displayAmount) !== Number(amount));
      const priceUsd = priceBasisUnknown ? null : asset.priceUsd;
      return [
        {
          mint: asset.mint,
          name: asset.name,
          symbol: asset.symbol,
          amount,
          displayAmount,
          priceUsd,
          valueUsd: priceUsd === null ? null : Number(amount) * priceUsd,
          valuationUnavailableReason: priceBasisUnknown
            ? "The price feed’s corporate-action adjustment basis is not verified."
            : priceUsd === null
              ? "No current token price is available."
              : null,
        },
      ];
    });
    const usdc = balances.get(MAINNET_USDC_MINT);
    const portfolio: MainnetPortfolio = {
      walletAddress: address,
      network: "mainnet-beta",
      observedAt: new Date().toISOString(),
      solBalance: fromTokenAmount(lamports.toString(), 9),
      usdcBalance: usdc
        ? fromTokenAmount(usdc.raw.toString(), usdc.decimals)
        : "0",
      holdings,
      pricedHoldingsValueUsd: holdings.reduce(
        (sum, holding) => sum + (holding.valueUsd ?? 0),
        0,
      ),
      hasUnpricedHoldings: holdings.some(
        (holding) => holding.valueUsd === null,
      ),
    };
    return NextResponse.json(portfolio, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Mainnet wallet balances could not be loaded. Refresh or configure a dedicated Solana mainnet RPC.",
      },
      { status: 503 },
    );
  }
}
