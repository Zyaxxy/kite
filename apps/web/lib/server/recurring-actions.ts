import { createHash } from "node:crypto";
import { createActionHeaders, type ActionGetResponse } from "@solana/actions";
import {
  DEVNET_GENESIS_HASH,
  DEVNET_RECURRING_BASKETS,
  validateDevnetXStockManifest,
} from "@kite/sdk";
import manifestJson from "../../public/xstocks-devnet/xstocks.json";
import { parseCreateDevnetPlan } from "./recurring-devnet-policy";
import { resolvePublishedCreatorBasket } from "./creator-store";

export const ACTION_CHAIN = `solana:${DEVNET_GENESIS_HASH.slice(0, 32)}`;
export const ACTION_CADENCES = {
  daily: { seconds: 86_400, label: "Daily" },
  weekly: { seconds: 604_800, label: "Weekly" },
  biweekly: { seconds: 1_209_600, label: "Every two weeks" },
  monthly: { seconds: 2_592_000, label: "Every 30 days" },
} as const;

export function actionHeaders(): Record<string, string> {
  return {
    ...createActionHeaders({ chainId: "devnet", actionVersion: "2.4" }),
    "Access-Control-Expose-Headers":
      "X-Blockchain-Ids, X-Action-Version, Retry-After",
    "Cache-Control": "no-store",
  };
}

export function actionSiteOrigin(): string {
  const url = new URL(process.env.KITE_SITE_URL || "http://localhost:3000");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Configure a canonical Kite site origin for Actions.");
  if (
    url.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  ) {
    throw new Error("Actions require a public HTTPS site origin.");
  }
  return url.origin;
}

export async function resolveActionBasket(id: string) {
  if (!/^[a-zA-Z0-9-]{1,40}$/.test(id))
    throw new Error("Select a published or curated basket.");
  const curated = DEVNET_RECURRING_BASKETS.find((basket) => basket.id === id);
  const creator = curated ? null : await resolvePublishedCreatorBasket(id);
  if (!curated && !creator) return null;
  const symbols =
    curated?.underlyingSymbols ??
    creator!.allocations.map((asset) => asset.symbol);
  const manifest = validateDevnetXStockManifest(manifestJson);
  const missing = symbols.filter(
    (symbol) =>
      !manifest.tokens.some((token) => token.underlyingSymbol === symbol),
  );
  return {
    id,
    name: curated?.name ?? creator!.name,
    symbols,
    available: Boolean(manifest.fundingToken) && missing.length === 0,
    missing,
  };
}

export function parseActionSubscription(
  id: string,
  search: URLSearchParams,
  body: unknown,
) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !["account", "data"].includes(key))
  )
    throw new Error("Provide an Action account to approve this subscription.");
  const input = body as { account?: unknown; data?: unknown };
  // Parameters come from the declared URL template; clients cannot supply arbitrary destinations/instructions.
  if (
    input.data !== undefined &&
    (typeof input.data !== "object" ||
      input.data === null ||
      Array.isArray(input.data) ||
      Object.keys(input.data).length > 0)
  )
    throw new Error("Unexpected subscription parameters.");
  for (const key of search.keys()) {
    if (
      !["amount", "cadence", "periods"].includes(key) ||
      search.getAll(key).length !== 1
    )
      throw new Error("Unexpected or duplicate subscription parameter.");
  }
  const cadence = search.get("cadence");
  if (!cadence || !Object.hasOwn(ACTION_CADENCES, cadence))
    throw new Error(
      "Choose daily, weekly, biweekly, or monthly recurring investing.",
    );
  const rawPeriods = search.get("periods");
  if (!rawPeriods || !/^[1-9]\d{0,2}$/.test(rawPeriods))
    throw new Error("Choose a whole number of installments within one year.");
  const request = parseCreateDevnetPlan({
    schemaVersion: 1,
    owner: input.account,
    target: { type: "basket", id },
    amount: search.get("amount"),
    periodSeconds:
      ACTION_CADENCES[cadence as keyof typeof ACTION_CADENCES].seconds,
    periods: Number(rawPeriods),
    supportedTransactionVersions: [0],
  });
  // Test faucet budgets and rent still matter: bound public transaction-preparation inputs.
  if (Number(request.amount) > 1_000_000)
    throw new Error("The maximum test installment is 1,000,000 KUSD.");
  return request;
}

export function subscriptionActionMetadata(
  basket: NonNullable<Awaited<ReturnType<typeof resolveActionBasket>>>,
  origin: string,
): ActionGetResponse {
  return {
    type: "action",
    icon: `${origin}/icon.svg`,
    title: `${basket.name} · Devnet recurring plan`,
    description:
      "Choose a test amount and schedule. This devnet demonstration delegates valueless KUSD to Kite Guard and mints test stocks to your wallet. No real stocks are purchased. Monthly means a fixed 30-day interval. Network fees and account rent require devnet SOL.",
    label: "Create test subscription",
    disabled: !basket.available,
    ...(!basket.available
      ? {
          error: {
            message:
              "Some basket assets have no provisioned devnet test mint. This subscription is unavailable.",
          },
        }
      : {}),
    links: {
      actions: [
        {
          type: "transaction",
          label: "Approve test subscription",
          href: `${origin}/api/actions/baskets/${encodeURIComponent(basket.id)}?amount={amount}&cadence={cadence}&periods={periods}`,
          parameters: [
            {
              name: "amount",
              label: "KUSD per installment",
              type: "number",
              required: true,
              min: 0.000001,
              max: 1000000,
            },
            {
              name: "cadence",
              label: "Frequency",
              type: "select",
              required: true,
              options: Object.entries(ACTION_CADENCES).map(
                ([value, cadence]) => ({
                  label: cadence.label,
                  value,
                  selected: value === "weekly",
                }),
              ),
            },
            {
              name: "periods",
              label: "Installments (total duration ≤ 1 year)",
              type: "number",
              required: true,
              min: 1,
              max: 365,
            },
          ],
        },
      ],
    },
  };
}

/** A retry within the blockhash review window must return the same unsigned plan. */
export function actionRequestKey(
  request: ReturnType<typeof parseActionSubscription>,
): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}
