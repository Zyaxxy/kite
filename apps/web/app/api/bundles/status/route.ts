import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  authorizeBundleStatus,
  verifyBundle,
  verifyBundleStatus,
} from "@/lib/server/bundle-authorization";
import { walletTransactionSignature } from "@kite/sdk";
import { getJitoBundleStatus } from "@/lib/server/jito-bundles";
import { recordConfirmedBasketReceipt } from "@/lib/server/basket-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await readLimitedJson(request, 12_000)) as {
      authorization?: unknown;
      bundleId?: unknown;
      signedTransactions?: unknown;
    };
    if (
      !body ||
      typeof body.authorization !== "string" ||
      (body.bundleId !== undefined &&
        (typeof body.bundleId !== "string" ||
          !/^[0-9a-f]{64}$/i.test(body.bundleId)))
    )
      throw new Error("A verified bundle receipt is required.");
    let statusAuthorization = body.authorization;
    if (body.signedTransactions !== undefined) {
      if (
        body.bundleId !== undefined ||
        !Array.isArray(body.signedTransactions) ||
        body.signedTransactions.length < 2 ||
        body.signedTransactions.length > 3 ||
        body.signedTransactions.some(
          (value) => typeof value !== "string" || value.length > 1644,
        )
      )
        throw new Error(
          "Use the complete signed bundle to recover its receipts.",
        );
      const original = verifyBundle(
        body.authorization,
        body.signedTransactions,
        { readOnly: true },
      );
      statusAuthorization = authorizeBundleStatus({
        taker: original.taker,
        lastValidBlockHeight: original.lastValidBlockHeight,
        signatures: await Promise.all(
          body.signedTransactions.map(walletTransactionSignature),
        ),
        basketId: original.basketId,
        inputMint: original.inputMint,
        inAmount: original.inAmount,
      });
    }
    const receipt = verifyBundleStatus(
      statusAuthorization,
      body.bundleId as string | undefined,
    );
    const result = await getJitoBundleStatus(receipt);
    if (result.status === "Success")
      await recordConfirmedBasketReceipt(
        receipt,
        receipt.taker,
        receipt.signatures[0],
      );
    return NextResponse.json(
      { ...result, statusAuthorization },
      {
        status:
          result.status === "Pending" || result.status === "Unknown"
            ? 202
            : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "Unknown",
        signatures: [],
        error:
          error instanceof Error
            ? error.message
            : "Bundle receipts are temporarily unavailable. Do not submit a replacement yet.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
