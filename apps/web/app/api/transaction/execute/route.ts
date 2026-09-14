import { NextRequest, NextResponse } from "next/server";
import { UNKNOWN_TRADE_MESSAGE } from "@kite/sdk";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  assertMainnet,
  mainnetRpc,
  mainnetV1Active,
  verifyComposed,
} from "@/lib/server/composed-transactions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  let submitted = false;
  let signature: string | undefined;
  const reply = (data: unknown, status = 200) =>
    NextResponse.json(data, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const body = (await readLimitedJson(request, 16384)) as Record<
      string,
      unknown
    >;
    if (
      !body ||
      typeof body.signedTransaction !== "string" ||
      body.signedTransaction.length > 8000 ||
      typeof body.authorization !== "string" ||
      body.authorization.length > 4000
    )
      throw new Error("A wallet-signed reviewed transaction is required.");
    const verified = await verifyComposed(
      body.authorization,
      body.signedTransaction,
    );
    if (verified.investmentRun)
      throw new Error(
        "Scheduled investments must use the durable executor endpoint.",
      );

    await assertMainnet();
    if (verified.version === 1 && !(await mainnetV1Active()))
      throw new Error(
        "V1 transactions are not active on the configured mainnet RPC.",
      );
    if (
      (await mainnetRpc<number>("getBlockHeight", [
        { commitment: "confirmed" },
      ])) > verified.lastValidBlockHeight
    )
      throw new Error(
        "The transaction blockhash expired. Request a new quote.",
      );
    submitted = true;
    signature = await mainnetRpc<string>("sendTransaction", [
      body.signedTransaction,
      {
        encoding: "base64",
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 2,
      },
    ]);
    for (let attempt = 0; attempt < 12; attempt++) {
      const result = await mainnetRpc<{
        value: ({ err: unknown; confirmationStatus: string } | null)[];
      }>("getSignatureStatuses", [
        [signature],
        { searchTransactionHistory: true },
      ]);
      const state = result.value[0];
      if (state?.err)
        return reply(
          {
            status: "Failed",
            signature,
            error:
              "The transaction failed on chain; its asset changes were rolled back. Network fees may still apply.",
          },
          422,
        );
      if (
        state &&
        ["confirmed", "finalized"].includes(state.confirmationStatus)
      )
        return reply({ status: "Success", signature });
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    return reply(
      { status: "Unknown", signature, error: UNKNOWN_TRADE_MESSAGE },
      202,
    );
  } catch (error) {
    return reply(
      {
        status: submitted ? "Unknown" : "Failed",
        signature,
        error: submitted
          ? UNKNOWN_TRADE_MESSAGE
          : error instanceof Error
            ? error.message
            : "Unable to prepare execution.",
      },
      submitted ? 502 : 400,
    );
  }
}
