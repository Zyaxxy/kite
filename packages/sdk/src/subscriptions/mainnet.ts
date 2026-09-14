import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { kitInstructionToWeb3, type RecurringPayment, inspectWalletTransaction } from "../basket/mainnet";

export const MAINNET_SUBSCRIPTIONS_PROGRAM =
  "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44";
export function validateRecurringTerms(
  amount: bigint,
  periodSeconds: number,
  periods: number,
) {
  if (amount <= 0n || amount > 2n ** 64n - 1n)
    throw new Error("A positive token amount is required.");
  if (
    !Number.isSafeInteger(periodSeconds) ||
    periodSeconds < 3600 ||
    periodSeconds > 31_536_000
  )
    throw new Error("Periods must be between one hour and one year.");
  if (
    !Number.isSafeInteger(periods) ||
    periods < 1 ||
    periods > 365 ||
    periodSeconds * periods > 31_536_000
  )
    throw new Error("Choose 1–365 periods with an expiry within one year.");
}
export async function subscriptionAuthorityAddress(
  owner: string,
  mint: string,
) {
  const [{ address }, s] = await Promise.all([
    import("@solana/kit"),
    import("@solana/subscriptions"),
  ]);
  return (
    await s.findSubscriptionAuthorityPda({
      user: address(owner),
      tokenMint: address(mint),
    })
  )[0] as string;
}
export async function decodeSubscriptionAuthority(data: Uint8Array) {
  const s = await import("@solana/subscriptions");
  const value = s.getSubscriptionAuthorityDecoder().decode(data);
  if (value.discriminator !== s.AccountDiscriminator.SubscriptionAuthority)
    throw new Error("Invalid subscription authority account.");
  return value;
}
export async function recurringAccountSize() {
  return (await import("@solana/subscriptions")).getRecurringDelegationDecoder()
    .fixedSize;
}
export async function decodeRecurringPayment(
  accountAddress: string,
  data: Uint8Array,
) {
  const s = await import("@solana/subscriptions");
  const value = s.getRecurringDelegationDecoder().decode(data);
  if (
    value.header.discriminator !== s.AccountDiscriminator.RecurringDelegation ||
    value.header.version !== s.CURRENT_PROGRAM_VERSION ||
    value.periodLengthS <= 0n
  )
    throw new Error("Unsupported recurring delegation account.");
  const payment: RecurringPayment = {
    address: accountAddress,
    owner: value.header.delegator,
    buyer: value.header.delegatee,
    mint: value.mint,
    amountPerPeriod: value.amountPerPeriod.toString(),
    periodSeconds: Number(value.periodLengthS),
    startsAt: Number(value.currentPeriodStartTs),
    expiresAt: Number(value.expiryTs),
    pulledInPeriod: value.amountPulledInPeriod.toString(),
    currentPeriodStartedAt: Number(value.currentPeriodStartTs),
  };
  return {
    payment,
    subscriptionAuthority: value.subscriptionAuthority,
    initId: value.header.initId,
    payer: value.header.payer,
  };
}
/** The SPL delegate is the shared program PDA. The recurring record bounds buyer withdrawals. */
export async function buildRecurringPaymentInstructions(params: {
  owner: string;
  buyer: string;
  mint: string;
  tokenProgram: string;
  amount: bigint;
  periodSeconds: number;
  periods: number;
  nonce: bigint;
  nowSeconds: number;
  initializeAuthority: boolean;
  expectedInitId?: bigint;
  /** Explicit UTC schedule start/expiry, bounded independently of fixed period count. */
  startsAt?: number;
  expiresAt?: number;
}) {
  validateRecurringTerms(params.amount, params.periodSeconds, params.periods);
  if (
    params.owner === params.buyer ||
    !PublicKey.isOnCurve(new PublicKey(params.buyer).toBytes())
  )
    throw new Error("Choose a distinct buyer signing wallet.");
  const [{ address, createNoopSigner }, s] = await Promise.all([
    import("@solana/kit"),
    import("@solana/subscriptions"),
  ]);
  const owner = createNoopSigner(address(params.owner)),
    mint = address(params.mint),
    buyer = address(params.buyer);
  const authority = await subscriptionAuthorityAddress(
    params.owner,
    params.mint,
  );
  const [delegation] = await s.findRecurringDelegationPda({
    subscriptionAuthority: address(authority),
    delegator: owner.address,
    delegatee: buyer,
    nonce: params.nonce,
  });
  const instructions: TransactionInstruction[] = [];
  if (params.initializeAuthority)
    instructions.push(
      kitInstructionToWeb3(
        await s.getInitSubscriptionAuthorityOverlayInstructionAsync({
          owner,
          tokenMint: mint,
          tokenProgram: address(params.tokenProgram),
          userAta: address(
            getAssociatedTokenAddressSync(
              new PublicKey(mint),
              new PublicKey(owner.address),
              false,
              new PublicKey(params.tokenProgram),
            ).toBase58(),
          ),
        }),
      ),
    );
  // Start at landing, expiry fixed before review. Landing delays cannot extend the grant.
  const startsAt = params.startsAt ?? 0;
  const expiresAt =
    params.expiresAt ??
    params.nowSeconds + params.periodSeconds * params.periods;
  if (
    !Number.isSafeInteger(startsAt) ||
    startsAt < 0 ||
    (startsAt !== 0 && startsAt < params.nowSeconds) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= (startsAt || params.nowSeconds) ||
    expiresAt - params.nowSeconds > 31_536_000
  )
    throw new Error("Choose a future schedule that ends within one year.");
  instructions.push(
    kitInstructionToWeb3(
      await s.getCreateRecurringDelegationOverlayInstructionAsync({
        delegator: owner,
        delegatee: buyer,
        tokenMint: mint,
        nonce: params.nonce,
        amountPerPeriod: params.amount,
        periodLengthS: BigInt(params.periodSeconds),
        startTs: BigInt(startsAt),
        expiryTs: BigInt(expiresAt),
        expectedSubscriptionAuthorityInitId: params.initializeAuthority
          ? s.UNKNOWN_INIT_ID
          : params.expectedInitId,
      }),
    ),
  );
  return {
    instructions,
    authority,
    payment: {
      address: delegation,
      owner: params.owner,
      buyer: params.buyer,
      mint: params.mint,
      amountPerPeriod: params.amount.toString(),
      periodSeconds: params.periodSeconds,
      startsAt,
      expiresAt,
      pulledInPeriod: "0",
      currentPeriodStartedAt: startsAt,
    } satisfies RecurringPayment,
  };
}
export async function buildRevokeRecurringInstruction(
  owner: string,
  delegation: string,
  payer: string,
) {
  const [{ address, createNoopSigner }, s] = await Promise.all([
    import("@solana/kit"),
    import("@solana/subscriptions"),
  ]);
  return kitInstructionToWeb3(
    s.getRevokeDelegationOverlayInstruction({
      authority: createNoopSigner(address(owner)),
      delegationAccount: address(delegation),
      receiver: address(payer),
    }),
  );
}
export function recurringRemaining(
  payment: RecurringPayment,
  nowSeconds: number,
) {
  if (
    nowSeconds < payment.currentPeriodStartedAt ||
    (payment.expiresAt !== 0 && nowSeconds >= payment.expiresAt)
  )
    return { amount: 0n, periodStartedAt: payment.currentPeriodStartedAt };
  const elapsed = Math.floor(
    (nowSeconds - payment.currentPeriodStartedAt) / payment.periodSeconds,
  );
  return {
    amount:
      BigInt(payment.amountPerPeriod) -
      (elapsed > 0 ? 0n : BigInt(payment.pulledInPeriod)),
    periodStartedAt:
      payment.currentPeriodStartedAt + elapsed * payment.periodSeconds,
  };
}
/** Buyer-side collection. Recipient is the buyer's own ATA; no Kite custody key exists. */
export async function buildCollectRecurringInstructions(
  payment: RecurringPayment,
  amount: bigint,
  tokenProgram: string,
) {
  if (amount <= 0n || amount > BigInt(payment.amountPerPeriod))
    throw new Error("Invalid collection amount.");
  // Hook-bearing Token-2022 requires additional resolved accounts. The API checks this explicitly.
  const [{ address, createNoopSigner }, s] = await Promise.all([
    import("@solana/kit"),
    import("@solana/subscriptions"),
  ]);
  const mint = new PublicKey(payment.mint),
    buyer = new PublicKey(payment.buyer),
    program = new PublicKey(tokenProgram);
  const receiver = getAssociatedTokenAddressSync(mint, buyer, false, program),
    source = getAssociatedTokenAddressSync(
      mint,
      new PublicKey(payment.owner),
      false,
      program,
    );
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      buyer,
      receiver,
      buyer,
      mint,
      program,
    ),
    kitInstructionToWeb3(
      await s.getTransferRecurringOverlayInstructionAsync({
        delegatee: createNoopSigner(address(payment.buyer)),
        delegationPda: address(payment.address),
        delegator: address(payment.owner),
        delegatorAta: address(source.toBase58()),
        receiverAta: address(receiver.toBase58()),
        tokenMint: address(payment.mint),
        tokenProgram: address(tokenProgram),
        amount,
      }),
    ),
  ];
}

export const TX_V1_FEATURE = "txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL";

export function featureActive(
  value: { owner: { toBase58(): string }; data: Buffer | Uint8Array } | null,
  slot: number | bigint,
): boolean {
  return Boolean(
    value &&
      value.owner.toBase58() ===
        "Feature111111111111111111111111111111111111" &&
      value.data.length === 9 &&
      value.data[0] === 1 &&
      Buffer.from(value.data).readBigUInt64LE(1) <= BigInt(slot),
  );
}

export async function signV1Collection(
  encoded: string,
  secretKey: Uint8Array,
): Promise<string> {
  const kit = await import("@solana/kit-v1");
  const { transaction, message } = await inspectWalletTransaction(encoded);
  if (message.version !== 1)
    throw new Error("Buyer collection requires a V1 transaction.");
  const keypair = await kit.createKeyPairFromBytes(secretKey);
  const signed = await kit.signTransaction([keypair], transaction);
  return Buffer.from(kit.getTransactionEncoder().encode(signed)).toString(
    "base64",
  );
}

