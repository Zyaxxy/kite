import { NextRequest, NextResponse } from "next/server";
import {
  walletTransactionSignature,
  type BasketBundleExecution,
} from "@kite/sdk";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  authorizeBundleStatus,
  verifyBundle,
} from "@/lib/server/bundle-authorization";
import { assertMainnet, mainnetRpc } from "@/lib/server/composed-transactions";
import { sendJitoBundle } from "@/lib/server/jito-bundles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let submitted = false;
  let signatures: string[] = [];
  let statusAuthorization: string | undefined;
  const reply = (body: BasketBundleExecution, status: number) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const body = (await readLimitedJson(request, 12_000)) as {
      signedTransactions?: unknown;
      authorization?: unknown;
    };
    if (
      !body ||
      typeof body.authorization !== "string" ||
      !Array.isArray(body.signedTransactions) ||
      body.signedTransactions.length < 2 ||
      body.signedTransactions.length > 3 ||
      body.signedTransactions.some(
        (value) => typeof value !== "string" || value.length > 1644,
      )
    )
      throw new Error("Sign every reviewed bundle transaction in order.");
    const signed = body.signedTransactions as string[];
    const authorization = verifyBundle(body.authorization, signed);
    await assertMainnet();
    if (
      (await mainnetRpc<number>("getBlockHeight", [
        { commitment: "confirmed" },
      ])) > authorization.lastValidBlockHeight
    )
      throw new Error(
        "The reviewed bundle blockhash expired. Check earlier receipts before requesting a new quote.",
      );
    signatures = await Promise.all(signed.map(walletTransactionSignature));
    const receipt = {
      taker: authorization.taker,
      signatures,
      lastValidBlockHeight: authorization.lastValidBlockHeight,
      basketId: authorization.basketId,
      inputMint: authorization.inputMint,
      inAmount: authorization.inAmount,
    };
    // Prepare recovery even when sendBundle's HTTP response is lost. Individual signatures remain queryable.
    statusAuthorization = authorizeBundleStatus(receipt);
    submitted = true;
    const bundleId = await sendJitoBundle(signed);
    statusAuthorization = authorizeBundleStatus({ ...receipt, bundleId });
    return reply(
      { status: "Pending", bundleId, signatures, statusAuthorization },
      202,
    );
  } catch (error) {
    return reply(
      {
        status: submitted ? "Unknown" : "Failed",
        signatures,
        statusAuthorization,
        error: submitted
          ? "Bundle submission could not be confirmed. Check all signatures before retrying; no individual transaction fallback was sent."
          : error instanceof Error
            ? error.message
            : "Unable to submit the reviewed bundle.",
      },
      submitted ? 202 : 422,
    );
  }
}
