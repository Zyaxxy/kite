import { NextRequest, NextResponse } from "next/server";
import type { BasketOrderRequest } from "@kite/sdk";
import { readLimitedJson } from "@/lib/server/request-policy";
import { prepareBasketOrder } from "@/lib/server/basket-order";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const body = (await readLimitedJson(request, 4096)) as BasketOrderRequest;
    if (
      !body ||
      typeof body.basketId !== "string" ||
      typeof body.taker !== "string" ||
      typeof body.inputMint !== "string" ||
      (body.supportedTransactionVersions !== undefined &&
        (!Array.isArray(body.supportedTransactionVersions) ||
          body.supportedTransactionVersions.length > 2 ||
          body.supportedTransactionVersions.some((v) => v !== 0 && v !== 1)))
    )
      throw new Error("Invalid basket request.");
    return NextResponse.json(await prepareBasketOrder(body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare the complete basket.",
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
}
