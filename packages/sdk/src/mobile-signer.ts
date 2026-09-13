import {
  canApproveTrade,
  classifyTradeExecution,
  UNKNOWN_TRADE_MESSAGE,
  type MainnetTradeOrder,
  type MainnetTradeResult,
} from "./trading";

export type SignableWalletOrder = Pick<
  MainnetTradeOrder,
  "taker" | "transaction" | "expiresAt" | "authorization" | "requestId"
> & { transactionVersion?: 0 | 1 };

export interface MobileOrderSigner {
  getAddress(): string | null;
  /** User-initiated wallet signing only. This method must not broadcast. */
  signTransaction(order: SignableWalletOrder): Promise<string>;
}
export interface MobileExecutionClient {
  executeTrade(request: {
    signedTransaction: string;
    authorization: string;
  }): Promise<MainnetTradeResult>;
}
export interface MobileExecutionOptions {
  /** Durably save only the attempt identity before broadcast. A storage failure stops execution. */
  beforeExecute?: (attempt: {
    walletAddress: string;
    requestId: string;
  }) => Promise<void>;
  now?: () => number;
}

/** Headless native workflow: wallet signs locally; the authenticated web API broadcasts. */
export async function signAndExecuteMobileOrder(
  order: SignableWalletOrder,
  client: MobileExecutionClient,
  signer: MobileOrderSigner,
  options: MobileExecutionOptions = {},
): Promise<MainnetTradeResult> {
  const now = options.now ?? Date.now;
  const assertCurrent = () => {
    if (!canApproveTrade(order, signer.getAddress(), now()))
      throw new Error(
        "The wallet changed or this quote expired. Request a new quote.",
      );
  };
  assertCurrent();
  const signedTransaction = await signer.signTransaction(order);
  assertCurrent();
  if (
    !signedTransaction ||
    signedTransaction.length > 8_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(signedTransaction)
  ) {
    throw new Error(
      "The wallet returned an invalid signed transaction. Nothing was submitted.",
    );
  }
  await options.beforeExecute?.({
    walletAddress: order.taker,
    requestId: order.requestId,
  });
  assertCurrent();
  try {
    return classifyTradeExecution(
      await client.executeTrade({
        signedTransaction,
        authorization: order.authorization,
      }),
    );
  } catch {
    // After entering executeTrade, a timeout cannot prove an onchain failure.
    return { status: "Unknown", error: UNKNOWN_TRADE_MESSAGE };
  }
}
