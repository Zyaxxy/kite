import { NextRequest, NextResponse } from "next/server";
import type { ActionPostResponse } from "@solana/actions";
import { basketInputDebitBounds, fromTokenAmount } from "@kite/sdk";
import {
  actionHeaders,
  actionSiteOrigin,
} from "@/lib/server/recurring-actions";
import {
  basketBuyActionMetadata,
  parseBasketBuyAction,
  resolveBuyActionBasket,
} from "@/lib/server/basket-buy-actions";
import { prepareBasketOrder } from "@/lib/server/basket-order";
import { readLimitedJson } from "@/lib/server/request-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const headers = () => actionHeaders("mainnet");
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: headers() });
}
export async function GET(_request: NextRequest, context: Context) {
  try {
    const basket = await resolveBuyActionBasket((await context.params).id);
    if (!basket)
      return NextResponse.json(
        { message: "This basket is not published." },
        { status: 404, headers: headers() },
      );
    return NextResponse.json(
      basketBuyActionMetadata(basket, actionSiteOrigin()),
      { headers: headers() },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Basket metadata is unavailable.",
      },
      { status: 503, headers: headers() },
    );
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const id = (await context.params).id;
    const input = parseBasketBuyAction(
      id,
      request.nextUrl.searchParams,
      await readLimitedJson(request, 2048),
    );
    if (!(await resolveBuyActionBasket(id)))
      return NextResponse.json(
        { message: "This basket is not published." },
        { status: 404, headers: headers() },
      );
    const order = await prepareBasketOrder(input);
    if ("kind" in order)
      throw new Error(
        `This complete basket requires multiple transactions. Review and buy it at ${actionSiteOrigin()}/basket/${id}. No purchase was submitted.`,
      );
    const response: ActionPostResponse = {
      type: "transaction",
      transaction: order.transaction,
      message: `Buy this basket with ${input.amount} mainnet USDC (maximum funding budget ${fromTokenAmount(basketInputDebitBounds(BigInt(order.inAmount)).maximum.toString(), order.inputDecimals)} USDC). Maximum slippage: 1%. Minimum outputs: ${order.outputs.map((output) => `${fromTokenAmount(output.minimumAmount, output.decimals)} ${output.symbol}`).join(", ")}. Priority fee: ${order.priorityFeeLamports} lamports; network fees and account rent also apply. Sign promptly; quotes expire.`,
    };
    return NextResponse.json(response, { headers: headers() });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to prepare the complete basket purchase.",
      },
      { status: 422, headers: headers() },
    );
  }
}
