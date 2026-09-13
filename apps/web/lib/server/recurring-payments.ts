import { randomBytes } from "node:crypto";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
  getTransferHook,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  MAINNET_SUBSCRIPTIONS_PROGRAM,
  MAINNET_SOL_MINT,
  subscriptionAuthorityAddress,
  decodeSubscriptionAuthority,
  decodeRecurringPayment,
  recurringAccountSize,
  buildRecurringPaymentInstructions,
  buildRevokeRecurringInstruction,
  buildCollectRecurringInstructions,
  recurringRemaining,
  composeMainnetTransaction,
  toTokenAmount,
  type RecurringPaymentRequest,
} from "@kite/sdk";
import {
  assertMainnet,
  assertMainnetV1Ready,
  authorizeComposed,
  latestBlockhash,
  mainnetRpc,
  simulateComposed,
  type RpcAccount,
} from "./composed-transactions";
import { getTradeMintDecimals } from "./mint-precision";

const accountInfo = (a: NonNullable<RpcAccount>) => ({
  ...a,
  owner: new PublicKey(a.owner),
  data: Buffer.from(a.data[0], "base64"),
  rentEpoch: 0,
});
async function account(key: string) {
  return (
    await mainnetRpc<{ value: RpcAccount }>("getAccountInfo", [
      key,
      { encoding: "base64", commitment: "confirmed" },
    ])
  ).value;
}
async function ready() {
  await assertMainnet();
  if (!(await account(MAINNET_SUBSCRIPTIONS_PROGRAM))?.executable)
    throw new Error(
      "The official Subscriptions program is unavailable on this RPC.",
    );
}
export async function mintProgram(mint: string) {
  if (mint === MAINNET_SOL_MINT)
    throw new Error(
      "Recurring payments require an SPL token balance. Choose USDC or another token; native SOL is not delegated.",
    );
  const value = await account(mint);
  if (
    !value ||
    ![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(
      value.owner,
    )
  )
    throw new Error("This mint is not a mainnet SPL token.");
  const decoded = unpackMint(
    new PublicKey(mint),
    accountInfo(value),
    new PublicKey(value.owner),
  );
  if (getTransferHook(decoded))
    throw new Error(
      "Recurring payments for tokens with transfer hooks are not supported by this collector.",
    );
  return value.owner;
}
export async function readDelegation(delegation: string) {
  const value = await account(delegation);
  if (!value || value.owner !== MAINNET_SUBSCRIPTIONS_PROGRAM)
    throw new Error("The delegation does not exist or was revoked.");
  return decodeRecurringPayment(
    delegation,
    Buffer.from(value.data[0], "base64"),
  );
}
async function order(
  taker: string,
  instructions: TransactionInstruction[],
  versions?: number[],
) {
  await assertMainnetV1Ready(versions);
  const lifetime = await latestBlockhash();
  const built = await composeMainnetTransaction({
    payer: taker,
    ...lifetime,
    instructions,
    allowV1: true,
    computeUnitLimit: 300_000,
  });
  await simulateComposed(built.transaction);
  return authorizeComposed({
    ...built,
    taker,
    lastValidBlockHeight: lifetime.lastValidBlockHeight,
    expiresAt: Date.now() + 45_000,
  });
}
export async function listRecurringPayments(wallet: string) {
  new PublicKey(wallet);
  await ready();
  const items = await mainnetRpc<
    { pubkey: string; account: NonNullable<RpcAccount> }[]
  >("getProgramAccounts", [
    MAINNET_SUBSCRIPTIONS_PROGRAM,
    {
      encoding: "base64",
      commitment: "confirmed",
      filters: [
        { dataSize: await recurringAccountSize() },
        { memcmp: { offset: 3, bytes: wallet } },
      ],
    },
  ]);
  return Promise.all(
    items.map(async (item) => {
      if (item.account.owner !== MAINNET_SUBSCRIPTIONS_PROGRAM)
        throw new Error("Unexpected delegation program.");
      const { payment } = await decodeRecurringPayment(
        item.pubkey,
        Buffer.from(item.account.data[0], "base64"),
      );
      if (payment.owner !== wallet)
        throw new Error("Unexpected delegation owner.");
      return payment;
    }),
  );
}
export async function prepareRecurringPayment(
  input: RecurringPaymentRequest,
  timing?: { startsAt: number; expiresAt: number },
) {
  const owner = new PublicKey(input.taker).toBase58(),
    buyer = new PublicKey(input.buyer).toBase58(),
    mint = new PublicKey(input.mint).toBase58();
  if (!PublicKey.isOnCurve(new PublicKey(owner).toBytes()))
    throw new Error("A signing wallet is required.");
  await ready();
  const [tokenProgram, decimals, authority] = await Promise.all([
    mintProgram(mint),
    getTradeMintDecimals(mint),
    subscriptionAuthorityAddress(owner, mint),
  ]);
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(owner),
    false,
    new PublicKey(tokenProgram),
  );
  const [authorityAccount, source] = await Promise.all([
    account(authority),
    account(ata.toBase58()),
  ]);
  if (!source)
    throw new Error(
      "Fund your token account before creating a recurring permission.",
    );
  const token = unpackAccount(
    ata,
    accountInfo(source),
    new PublicKey(tokenProgram),
  );
  if (
    !token.owner.equals(new PublicKey(owner)) ||
    !token.mint.equals(new PublicKey(mint)) ||
    token.isFrozen
  )
    throw new Error("The funding account is not spendable by your wallet.");
  let expectedInitId: bigint | undefined;
  if (authorityAccount) {
    if (authorityAccount.owner !== MAINNET_SUBSCRIPTIONS_PROGRAM)
      throw new Error("Invalid subscription authority owner.");
    const decoded = await decodeSubscriptionAuthority(
      Buffer.from(authorityAccount.data[0], "base64"),
    );
    if (decoded.user !== owner || decoded.tokenMint !== mint)
      throw new Error("Invalid subscription authority identity.");
    if (
      token.delegate?.toBase58() !== authority ||
      token.delegatedAmount === BigInt(0)
    )
      throw new Error(
        "This token's subscription authority was disabled. Kite will not silently restore existing permissions.",
      );
    expectedInitId = decoded.initId;
  } else if (token.delegate)
    throw new Error(
      "This token account already has a delegate. Revoke that permission in your wallet before continuing.",
    );
  const built = await buildRecurringPaymentInstructions({
    owner,
    buyer,
    mint,
    tokenProgram,
    amount: BigInt(toTokenAmount(input.amount, decimals)),
    periodSeconds: input.periodSeconds,
    periods: input.periods,
    nonce: randomBytes(8).readBigUInt64LE(),
    nowSeconds: Math.floor(Date.now() / 1000),
    initializeAuthority: !authorityAccount,
    expectedInitId,
    startsAt: timing?.startsAt,
    expiresAt: timing?.expiresAt,
  });
  return {
    instructions: built.instructions,
    payment: built.payment,
    decimals,
  };
}
export async function createRecurringPayment(input: RecurringPaymentRequest) {
  await assertMainnetV1Ready(input.supportedTransactionVersions);
  const built = await prepareRecurringPayment(input);
  return {
    ...(await order(
      input.taker,
      built.instructions,
      input.supportedTransactionVersions,
    )),
    payment: built.payment,
    decimals: built.decimals,
  };
}
export async function revokeRecurringPayment(
  taker: string,
  delegation: string,
  supportedTransactionVersions?: number[],
) {
  new PublicKey(taker);
  new PublicKey(delegation);
  await ready();
  const state = await readDelegation(delegation);
  if (state.payment.owner !== taker)
    throw new Error("Only the permission owner can revoke it here.");
  return order(
    taker,
    [await buildRevokeRecurringInstruction(taker, delegation, state.payer)],
    supportedTransactionVersions,
  );
}
export async function collectRecurringPayment(
  taker: string,
  delegation: string,
  supportedTransactionVersions?: number[],
) {
  new PublicKey(taker);
  new PublicKey(delegation);
  await ready();
  const { payment } = await readDelegation(delegation);
  if (payment.buyer !== taker)
    throw new Error("Only the approved buyer can sign this collection.");
  const remaining = recurringRemaining(payment, Math.floor(Date.now() / 1000));
  if (remaining.amount <= BigInt(0))
    throw new Error("No allowance is currently available for collection.");
  const tokenProgram = await mintProgram(payment.mint);
  return {
    ...(await order(
      taker,
      await buildCollectRecurringInstructions(
        payment,
        remaining.amount,
        tokenProgram,
      ),
      supportedTransactionVersions,
    )),
    amount: remaining.amount.toString(),
    periodStartedAt: remaining.periodStartedAt,
    mint: payment.mint,
  };
}
