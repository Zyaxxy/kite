import { randomInt } from "node:crypto";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BASKET_MAX_TRANSACTIONS, type BasketBundleExecution } from "@kite/sdk";
import { assertMainnet, mainnetRpc } from "./composed-transactions";
import type { BundleStatusAuthorization } from "./bundle-authorization";

const ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const TIP_FLOOR = "https://bundles.jito.wtf/api/v1/bundles/tip_floor";
export const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
] as const;
/** An explicit engine rejection is not proof that no signed transaction can land. */
export class JitoRejectedError extends Error {}

type JitoMethod = "getTipAccounts" | "sendBundle" | "getInflightBundleStatuses";

function jitoUnavailable(method: JitoMethod, rateLimited = false): Error {
  if (method === "getTipAccounts")
    return new Error(
      rateLimited
        ? "Jito tip discovery is rate-limited. No transactions were submitted. Try preparing the basket again shortly."
        : "Jito tip accounts are temporarily unavailable. No transactions were submitted. Try preparing the basket again shortly.",
    );
  return new Error(
    method === "sendBundle"
      ? "Jito did not confirm bundle submission. Check every signature before retrying; no individual transaction fallback was sent."
      : "Jito bundle status is temporarily unavailable. Check every signature before retrying.",
  );
}

async function jitoRpc<T>(
  method: JitoMethod,
  params: unknown[] = [],
): Promise<T> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(ENGINE, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "Content-Type": "application/json",
        ...(process.env.JITO_AUTH_UUID
          ? { "x-jito-auth": process.env.JITO_AUTH_UUID }
          : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  } catch {
    // Provider/transport errors can contain credentials or request data. Do not expose them.
    throw jitoUnavailable(method);
  }
  try {
    body = await response.json();
  } catch {
    throw jitoUnavailable(method, response.status === 429);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw jitoUnavailable(method, response.status === 429);
  const reply = body as {
    result?: T;
    error?: unknown;
    jsonrpc?: unknown;
    id?: unknown;
  };
  if (reply.error !== undefined && reply.error !== null) {
    const error = reply.error;
    // Only a well-formed response to sendBundle is an explicit engine rejection.
    // Transport failures and malformed receipts keep submission uncertain.
    if (
      method === "sendBundle" &&
      reply.jsonrpc === "2.0" &&
      reply.id === 1 &&
      reply.result === undefined &&
      typeof error === "object" &&
      !Array.isArray(error) &&
      Number.isInteger((error as { code?: unknown }).code) &&
      typeof (error as { message?: unknown }).message === "string"
    )
      throw new JitoRejectedError(
        "Jito rejected the bundle request. Check every signature before retrying; no individual transaction fallback was sent.",
      );
    throw jitoUnavailable(method, response.status === 429);
  }
  if (!response.ok || reply.result === undefined || reply.result === null)
    throw jitoUnavailable(method, response.status === 429);
  return reply.result;
}
let tipCache:
  | { until: number; accounts: string[]; floorSol: number | undefined }
  | undefined;
let loadingTip: Promise<NonNullable<typeof tipCache>> | undefined;

export function selectJitoTipLamports(
  floorSol: unknown,
  configuredCap = 100_000,
): number {
  if (
    !Number.isSafeInteger(configuredCap) ||
    configuredCap < 1000 ||
    configuredCap > 100_000
  )
    throw new Error("JITO_MAX_TIP_LAMPORTS must be between 1,000 and 100,000.");
  const dynamic =
    typeof floorSol === "number" && Number.isFinite(floorSol) && floorSol > 0
      ? Math.ceil(floorSol * 1_000_000_000)
      : 10_000;
  return Math.min(configuredCap, Math.max(1000, dynamic));
}
async function tipQuote() {
  if (tipCache && tipCache.until > Date.now()) return tipCache;
  if (loadingTip) return loadingTip;
  loadingTip = (async () => {
    const [accounts, floor] = await Promise.all([
      jitoRpc<string[]>("getTipAccounts"),
      fetch(TIP_FLOOR, { cache: "no-store", signal: AbortSignal.timeout(3000) })
        .then(async (response) => (response.ok ? response.json() : null))
        .catch(() => null),
    ]);
    if (
      !Array.isArray(accounts) ||
      !accounts.length ||
      accounts.some(
        (key) =>
          !JITO_TIP_ACCOUNTS.includes(
            key as (typeof JITO_TIP_ACCOUNTS)[number],
          ),
      )
    )
      throw new Error(
        "Jito tip accounts could not be verified. No transactions were submitted.",
      );
    tipCache = {
      until: Date.now() + 30_000,
      accounts,
      floorSol: Array.isArray(floor)
        ? (floor[0]?.ema_landed_tips_50th_percentile ??
          floor[0]?.landed_tips_50th_percentile)
        : undefined,
    };
    return tipCache;
  })().finally(() => {
    loadingTip = undefined;
  });
  return loadingTip;
}
export async function prepareJitoTip(taker: string) {
  const { accounts, floorSol } = await tipQuote();
  const lamports = selectJitoTipLamports(
    floorSol,
    Number(process.env.JITO_MAX_TIP_LAMPORTS ?? 100_000),
  );
  return {
    lamports,
    instruction: SystemProgram.transfer({
      fromPubkey: new PublicKey(taker),
      toPubkey: new PublicKey(accounts[randomInt(accounts.length)]),
      lamports,
    }),
  };
}
export async function sendJitoBundle(transactions: string[]): Promise<string> {
  if (transactions.length < 2 || transactions.length > BASKET_MAX_TRANSACTIONS)
    throw new Error(
      "A basket bundle must contain two to five reviewed transactions.",
    );
  // The official API transports signed base64 bytes. Mainnet feature activation does
  // not establish the Block Engine's V1 rollout; rejection/uncertain delivery stays
  // fail-closed and is never retried through individual sendTransaction calls.
  const bundleId = await jitoRpc<string>("sendBundle", [
    transactions,
    { encoding: "base64" },
  ]);
  if (typeof bundleId !== "string" || !/^[0-9a-f]{64}$/i.test(bundleId))
    throw new Error(
      "Jito returned an invalid receipt. Check signatures before retrying.",
    );
  return bundleId;
}

/** Receipt acquisition and a Jito 'Landed' response are not chain confirmation. */
export async function getJitoBundleStatus(
  receipt: BundleStatusAuthorization,
): Promise<BasketBundleExecution> {
  await assertMainnet();
  const statuses = await mainnetRpc<{
    value: ({
      err: unknown;
      confirmationStatus: string | null;
      slot: number;
    } | null)[];
  }>("getSignatureStatuses", [
    receipt.signatures,
    { searchTransactionHistory: true },
  ]);
  const base = { bundleId: receipt.bundleId, signatures: receipt.signatures };
  const values = statuses.value;
  if (!Array.isArray(values) || values.length !== receipt.signatures.length)
    return {
      ...base,
      status: "Unknown",
      error:
        "Chain receipts are unavailable. Check every signature before retrying.",
    };
  const confirmed = values.filter(
    (state) =>
      state &&
      !state.err &&
      ["confirmed", "finalized"].includes(state.confirmationStatus ?? ""),
  );
  if (confirmed.length === values.length) {
    // Different slots indicate independent rebroadcast, even if every trade eventually succeeded.
    if (new Set(confirmed.map((state) => state!.slot)).size !== 1)
      return {
        ...base,
        status: "Unknown",
        error:
          "Transactions landed in different slots. Review all holdings and receipts; bundle execution could not be confirmed.",
      };
    return { ...base, status: "Success" };
  }
  if (values.some((state) => state?.err) || confirmed.length > 0)
    return {
      ...base,
      status: "Unknown",
      error:
        "Some basket transactions have a different result. Partial execution is possible; check every receipt before retrying.",
    };
  // Jito status is additional diagnostic evidence, never proof that no leaked transaction can land.
  let jitoFailed = false;
  if (receipt.bundleId) {
    try {
      const status = await jitoRpc<{
        value: ({ bundle_id: string; status: string } | null)[];
      }>("getInflightBundleStatuses", [[receipt.bundleId]]);
      jitoFailed = status.value?.[0]?.status === "Failed";
    } catch {
      /* RPC signatures remain the source of confirmed execution. */
    }
  }
  const blockHeight = await mainnetRpc<number>("getBlockHeight", [
    { commitment: "finalized" },
  ]);
  if (blockHeight > receipt.lastValidBlockHeight)
    return {
      ...base,
      status: "Unknown",
      error:
        "The bundle blockhash expired without complete confirmed receipts. Review wallet activity before a new purchase.",
    };
  return {
    ...base,
    status: "Pending",
    ...(jitoFailed
      ? {
          error:
            "Jito reported rejection. Waiting for final signature checks; do not submit a replacement yet.",
        }
      : {}),
  };
}
