import { NextRequest, NextResponse } from "next/server";
import type { ActionPostResponse } from "@solana/actions";
import {
  actionHeaders,
  actionRequestKey,
  actionSiteOrigin,
  parseActionSubscription,
  resolveActionBasket,
  subscriptionActionMetadata,
} from "@/lib/server/recurring-actions";
import { readLimitedJson } from "@/lib/server/request-policy";
import { createDevnetRecurringPlan } from "@/lib/server/recurring-devnet";
import { keeperStore } from "@/lib/server/recurring-keeper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: actionHeaders() });
}
export async function GET(_request: NextRequest, context: Context) {
  try {
    const basket = await resolveActionBasket((await context.params).id);
    if (!basket)
      return NextResponse.json(
        { message: "This basket is not published." },
        { status: 404, headers: actionHeaders() },
      );
    return NextResponse.json(
      subscriptionActionMetadata(basket, actionSiteOrigin()),
      { headers: actionHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Subscription metadata is unavailable.",
      },
      { status: 503, headers: actionHeaders() },
    );
  }
}

const preparing = new Map<string, Promise<ActionPostResponse>>();
export async function POST(request: NextRequest, context: Context) {
  try {
    const id = (await context.params).id;
    const input = parseActionSubscription(
      id,
      request.nextUrl.searchParams,
      await readLimitedJson(request, 2048),
    );
    const basket = await resolveActionBasket(id);
    if (!basket)
      return NextResponse.json(
        { message: "This basket is not published." },
        { status: 404, headers: actionHeaders() },
      );
    if (!basket.available)
      throw new Error(
        "This basket has unprovisioned devnet stocks and cannot be subscribed to.",
      );
    const key = `action:${actionRequestKey(input)}`;
    const cached = await keeperStore.read<ActionPostResponse>(key);
    if (cached) return NextResponse.json(cached, { headers: actionHeaders() });
    let work = preparing.get(key);
    if (!work) {
      work = (async () => {
        const prepared = await createDevnetRecurringPlan(input);
        const response: ActionPostResponse = {
          type: "transaction",
          transaction: prepared.transaction,
          message: `Approve ${input.amount} test KUSD every ${input.periodSeconds / 86_400} days for ${input.periods} installments on devnet. Test stock mints have no market value. Revoke the plan in Kite at any time.`,
        };
        await keeperStore.write(key, response, 30_000);
        return response;
      })();
      preparing.set(key, work);
    }
    try {
      return NextResponse.json(await work, { headers: actionHeaders() });
    } finally {
      preparing.delete(key);
    }
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to prepare this devnet subscription.",
      },
      { status: 422, headers: actionHeaders() },
    );
  }
}
