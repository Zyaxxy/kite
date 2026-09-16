import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { kitInstructionToWeb3 } from "../basket/mainnet";
import { MAINNET_SUBSCRIPTIONS_PROGRAM } from "../subscriptions/mainnet";
import {
  KITE_GUARD_PROGRAM_ID,
  allocateGuardFunding,
  validatePlanTerms,
} from "./client";

export const DEVNET_RAYDIUM_CPMM_PROGRAM = new PublicKey(
  "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
);
export const GUARD_VERSION = 2;
const CREATE = [77, 43, 141, 254, 212, 118, 41, 186];
const COLLECT = [56, 182, 124, 215, 155, 140, 157, 102];
const CLOSE = [45, 137, 184, 220, 162, 253, 161, 8];
const PROTOCOL = [147, 149, 48, 158, 234, 222, 20, 181];
const PLAN = [161, 231, 251, 119, 2, 12, 162, 2];
const POOL = [247, 237, 227, 245, 215, 195, 222, 70];
const AMM_CONFIG = [218, 244, 33, 104, 203, 203, 43, 111];
const U64_MAX = (1n << 64n) - 1n;

export interface DevnetGuardOutput {
  mint: string;
  weightBps: number;
  /** Devnet mock mode uses default/null pool. Mainnet/real mode requires a pool address. */
  pool: string;
  minimumAmountOut: bigint;
}
export interface DevnetGuardPlan {
  address: string;
  version: 2;
  /** When true, devnet execution mints mock tokens directly instead of swapping through pools. */
  devnetMock: boolean;
  owner: string;
  fundingMint: string;
  nonce: bigint;
  fundingAmount: bigint;
  periodSeconds: bigint;
  startsAt: bigint;
  expiresAt: bigint;
  periods: number;
  executedPeriods: number;
  lastExecutedPeriod: number;
  lastExecutedAt: bigint;
  subscriptionAuthority: string;
  recurringDelegation: string;
  subscriptionInitId: bigint;
  bump: number;
  outputs: DevnetGuardOutput[];
}
export interface DevnetCpmmPool {
  pool: string;
  ammConfig: string;
  inputVault: string;
  outputVault: string;
  observation: string;
  fundingMint: string;
  outputMint: string;
  inputFees: bigint;
  outputFees: bigint;
  openTime: bigint;
  swapsEnabled: boolean;
  creatorFeeEnabled: boolean;
}
export interface BuildGuardCreateParams {
  owner: string;
  fundingMint: string;
  nonce: bigint;
  fundingAmount: bigint;
  periodSeconds: bigint;
  startsAt: bigint;
  expiresAt: bigint;
  periods: number;
  outputs: DevnetGuardOutput[];
  /** Required for mainnet/real mode; ignored in devnet mock mode. */
  pools: DevnetCpmmPool[];
  /** When true, devnet execution mints mock tokens directly. Defaults to false. */
  devnetMock?: boolean;
  initializeAuthority: boolean;
  expectedInitId?: bigint;
}

function u64(value: bigint): Buffer {
  if (typeof value !== "bigint" || value < 0n || value > U64_MAX)
    throw new Error("Value must fit an unsigned 64-bit integer.");
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}
function i64(value: bigint): Buffer {
  if (typeof value !== "bigint" || value < 0n || value > (1n << 63n) - 1n)
    throw new Error("Invalid nonnegative timestamp.");
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(value);
  return bytes;
}
function u16(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > 65535)
    throw new Error("Invalid u16 value.");
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}
const key = (value: string | PublicKey) => new PublicKey(value);
const meta = (
  value: string | PublicKey,
  isWritable = false,
  isSigner = false,
): AccountMeta => ({ pubkey: key(value), isWritable, isSigner });
const ata = (mint: string, owner: string | PublicKey) =>
  getAssociatedTokenAddressSync(key(mint), key(owner), true, TOKEN_PROGRAM_ID);
export function findGuardPlanPda(
  owner: string | PublicKey,
  fundingMint: string | PublicKey,
  nonce: bigint,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("plan_v2"),
      key(owner).toBuffer(),
      key(fundingMint).toBuffer(),
      u64(nonce),
    ],
    KITE_GUARD_PROGRAM_ID,
  );
}
export function guardSubscriptionAuthority(
  owner: string,
  fundingMint: string,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("SubscriptionAuthority"),
      key(owner).toBuffer(),
      key(fundingMint).toBuffer(),
    ],
    key(MAINNET_SUBSCRIPTIONS_PROGRAM),
  )[0];
}
export function guardRecurringDelegation(
  owner: string,
  fundingMint: string,
  nonce: bigint,
): PublicKey {
  const plan = findGuardPlanPda(owner, fundingMint, nonce)[0];
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("delegation"),
      guardSubscriptionAuthority(owner, fundingMint).toBuffer(),
      key(owner).toBuffer(),
      plan.toBuffer(),
      u64(nonce),
    ],
    key(MAINNET_SUBSCRIPTIONS_PROGRAM),
  )[0];
}
export function guardMockMintAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mock_mint_authority")],
    KITE_GUARD_PROGRAM_ID,
  )[0];
}
export function raydiumDevnetAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_and_lp_mint_auth_seed")],
    DEVNET_RAYDIUM_CPMM_PROGRAM,
  )[0];
}
export function subscriptionsEventAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("event_authority")],
    key(MAINNET_SUBSCRIPTIONS_PROGRAM),
  )[0];
}

/** Callers separately verify RPC account ownership. This rejects unknown account layouts. */
export function decodeDevnetCpmmPool(
  data: Uint8Array,
  address: string,
  fundingMint: string,
  outputMint: string,
): DevnetCpmmPool {
  const bytes = Buffer.from(data);
  if (bytes.length !== 637 || !bytes.subarray(0, 8).equals(Buffer.from(POOL)))
    throw new Error("Unsupported Raydium CPMM pool layout.");
  const pub = (offset: number) =>
    new PublicKey(bytes.subarray(offset, offset + 32)).toBase58();
  const mint0 = pub(168),
    mint1 = pub(200);
  const forward = mint0 === fundingMint && mint1 === outputMint;
  if (!forward && !(mint1 === fundingMint && mint0 === outputMint))
    throw new Error("Pool does not match the approved funding/output mints.");
  if (
    pub(232) !== TOKEN_PROGRAM_ID.toBase58() ||
    pub(264) !== TOKEN_PROGRAM_ID.toBase58()
  )
    throw new Error("Devnet recurring supports classic SPL token pools only.");
  const fees0 =
    bytes.readBigUInt64LE(341) +
    bytes.readBigUInt64LE(357) +
    bytes.readBigUInt64LE(397);
  const fees1 =
    bytes.readBigUInt64LE(349) +
    bytes.readBigUInt64LE(365) +
    bytes.readBigUInt64LE(405);
  if (bytes[390] > 1 || bytes[389] > 2)
    throw new Error("Unsupported CPMM creator fee configuration.");
  return {
    pool: key(address).toBase58(),
    ammConfig: pub(8),
    inputVault: pub(forward ? 72 : 104),
    outputVault: pub(forward ? 104 : 72),
    observation: pub(296),
    fundingMint,
    outputMint,
    inputFees: forward ? fees0 : fees1,
    outputFees: forward ? fees1 : fees0,
    openTime: bytes.readBigUInt64LE(373),
    swapsEnabled: (bytes[329] & 4) === 0,
    creatorFeeEnabled: bytes[390] === 1,
  };
}
export function decodeDevnetCpmmTradeFee(data: Uint8Array): bigint {
  const bytes = Buffer.from(data);
  if (
    bytes.length !== 236 ||
    !bytes.subarray(0, 8).equals(Buffer.from(AMM_CONFIG))
  )
    throw new Error("Unsupported Raydium fee configuration.");
  const fee = bytes.readBigUInt64LE(12);
  if (fee >= 1_000_000n) throw new Error("Invalid pool trading fee.");
  return fee;
}
/** Classic SPL, creator-fees disabled only. These are pool quotes, not equity oracle prices. */
export function quoteDevnetCpmmExactIn(params: {
  pool: DevnetCpmmPool;
  amountIn: bigint;
  inputVaultAmount: bigint;
  outputVaultAmount: bigint;
  tradeFeeRate: bigint;
  slippageBps: number;
  nowSeconds: bigint;
}): { amountOut: bigint; minimumAmountOut: bigint } {
  const { pool, amountIn, tradeFeeRate, slippageBps } = params;
  if (!pool.swapsEnabled || pool.openTime > params.nowSeconds)
    throw new Error("The devnet pool is not open for swaps.");
  if (pool.creatorFeeEnabled)
    throw new Error(
      "Creator-fee pools are not supported by the devnet quote adapter.",
    );
  if (
    typeof amountIn !== "bigint" ||
    amountIn <= 0n ||
    amountIn > U64_MAX ||
    tradeFeeRate < 0n ||
    tradeFeeRate >= 1_000_000n
  )
    throw new Error("Invalid swap amount or fee.");
  if (
    !Number.isSafeInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 500
  )
    throw new Error("Slippage must be between 0 and 500 bps.");
  const reserveIn = params.inputVaultAmount - pool.inputFees;
  const reserveOut = params.outputVaultAmount - pool.outputFees;
  if (reserveIn <= 0n || reserveOut <= 0n)
    throw new Error("The devnet pool has no usable liquidity.");
  const netInput = amountIn - (amountIn * tradeFeeRate + 999_999n) / 1_000_000n;
  if (netInput <= 0n)
    throw new Error("Installment allocation is too small after pool fees.");
  const amountOut = (reserveOut * netInput) / (reserveIn + netInput);
  const minimumAmountOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  if (minimumAmountOut <= 0n)
    throw new Error("Installment allocation produces no spendable output.");
  return { amountOut, minimumAmountOut };
}

export function decodeGuardPlan(
  data: Uint8Array,
  address: string,
): DevnetGuardPlan {
  const bytes = Buffer.from(data);
  if (
    bytes.length !== 1045 ||
    !bytes.subarray(0, 8).equals(Buffer.from(PLAN)) ||
    bytes[8] !== 2
  )
    throw new Error("Unsupported Guard plan version.");
  let cursor = 9;
  const devnetMock = bytes[cursor++] === 1;
  const pub = () => {
    const value = new PublicKey(bytes.subarray(cursor, cursor + 32)).toBase58();
    cursor += 32;
    return value;
  };
  const number64 = (signed = false) => {
    const value = signed
      ? bytes.readBigInt64LE(cursor)
      : bytes.readBigUInt64LE(cursor);
    cursor += 8;
    return value;
  };
  const number16 = () => {
    const value = bytes.readUInt16LE(cursor);
    cursor += 2;
    return value;
  };
  const owner = pub(),
    fundingMint = pub(),
    nonce = number64(),
    fundingAmount = number64(),
    periodSeconds = number64();
  const startsAt = number64(true),
    expiresAt = number64(true),
    periods = number16(),
    executedPeriods = number16(),
    lastExecutedPeriod = number16(),
    lastExecutedAt = number64(true);
  const subscriptionAuthority = pub(),
    recurringDelegation = pub(),
    subscriptionInitId = number64(true),
    bump = bytes[cursor++];
  const count = bytes.readUInt32LE(cursor);
  cursor += 4;
  if (count < 1 || count > 20 || bytes.length < cursor + count * 42)
    throw new Error("Invalid Guard basket size.");
  const outputs: DevnetGuardOutput[] = [];
  for (let index = 0; index < count; index++)
    outputs.push({
      mint: pub(),
      weightBps: number16(),
      pool: PublicKey.default.toBase58(),
      minimumAmountOut: number64(),
    });
  const plan: DevnetGuardPlan = {
    address: key(address).toBase58(),
    version: 2,
    devnetMock,
    owner,
    fundingMint,
    nonce,
    fundingAmount,
    periodSeconds,
    startsAt,
    expiresAt,
    periods,
    executedPeriods,
    lastExecutedPeriod,
    lastExecutedAt,
    subscriptionAuthority,
    recurringDelegation,
    subscriptionInitId,
    bump,
    outputs,
  };
  validateGuardPlan(plan);
  return plan;
}
export function validateGuardPlan(plan: DevnetGuardPlan): void {
  validatePlanTerms(plan);
  const [expected, bump] = findGuardPlanPda(
    plan.owner,
    plan.fundingMint,
    plan.nonce,
  );
  if (
    plan.version !== 2 ||
    expected.toBase58() !== plan.address ||
    bump !== plan.bump
  )
    throw new Error("Guard plan identity mismatch.");
  if (
    guardSubscriptionAuthority(plan.owner, plan.fundingMint).toBase58() !==
      plan.subscriptionAuthority ||
    guardRecurringDelegation(
      plan.owner,
      plan.fundingMint,
      plan.nonce,
    ).toBase58() !== plan.recurringDelegation
  )
    throw new Error("Guard delegation identity mismatch.");
  if (
    plan.startsAt <= 0n ||
    plan.expiresAt !== plan.startsAt + plan.periodSeconds * BigInt(plan.periods)
  )
    throw new Error("Invalid Guard plan expiry.");
  if (
    plan.executedPeriods < 0 ||
    plan.executedPeriods > plan.periods ||
    (plan.lastExecutedPeriod !== 65535 &&
      plan.lastExecutedPeriod >= plan.periods)
  )
    throw new Error("Invalid Guard execution state.");
  i64(plan.startsAt);
  i64(plan.expiresAt);
  i64(plan.lastExecutedAt);
  if (
    !Number.isSafeInteger(plan.executedPeriods) ||
    !Number.isSafeInteger(plan.lastExecutedPeriod)
  )
    throw new Error("Invalid Guard execution counters.");
  if (
    plan.executedPeriods === 0
      ? plan.lastExecutedPeriod !== 65535 || plan.lastExecutedAt !== 0n
      : plan.lastExecutedPeriod === 65535 ||
        plan.executedPeriods > plan.lastExecutedPeriod + 1 ||
        plan.lastExecutedAt <
          plan.startsAt +
            BigInt(plan.lastExecutedPeriod) * plan.periodSeconds ||
        plan.lastExecutedAt >=
          plan.startsAt +
            BigInt(plan.lastExecutedPeriod + 1) * plan.periodSeconds
  )
    throw new Error("Inconsistent Guard execution state.");
  if (key(plan.fundingMint).equals(PublicKey.default))
    throw new Error("A funding mint is required.");
  const pools = new Set<string>();
  for (const output of plan.outputs) {
    const pool = key(output.pool).toBase58();
    u64(output.minimumAmountOut);
    if (plan.devnetMock) {
      if (!key(output.pool).equals(PublicKey.default))
        throw new Error("Devnet mock outputs must not specify a pool.");
    } else {
      if (key(output.pool).equals(PublicKey.default) || pools.has(pool))
        throw new Error("Each output requires a distinct valid pool and mint.");
      pools.add(pool);
    }
    if (
      key(output.mint).equals(PublicKey.default) ||
      pools.has(output.mint)
    )
      throw new Error("Each output requires a distinct valid mint.");
    if (output.minimumAmountOut === 0n)
      throw new Error(
        "An owner-approved minimum output is required for every asset.",
      );
  }
  allocateGuardFunding(plan.fundingAmount, plan.outputs);
}
export function guardDuePeriod(
  plan: DevnetGuardPlan,
  nowSeconds: bigint,
): number {
  validateGuardPlan(plan);
  if (
    nowSeconds < plan.startsAt ||
    nowSeconds >= plan.expiresAt ||
    plan.executedPeriods >= plan.periods
  )
    throw new Error("This plan has no installment due.");
  const period = Number((nowSeconds - plan.startsAt) / plan.periodSeconds);
  if (plan.lastExecutedPeriod !== 65535 && period <= plan.lastExecutedPeriod)
    throw new Error("This installment was already collected.");
  return period;
}

function mockLegAccounts(owner: string, outputs: DevnetGuardOutput[]): AccountMeta[] {
  return outputs.flatMap((output) => [
    meta(output.mint, true),
    meta(ata(output.mint, owner), true),
  ]);
}

function legAccounts(
  owner: string,
  fundingMint: string,
  outputs: DevnetGuardOutput[],
  pools: DevnetCpmmPool[],
): AccountMeta[] {
  if (pools.length !== outputs.length)
    throw new Error("Every basket asset requires its approved pool.");
  return outputs.flatMap((output, index) => {
    const pool = pools[index];
    if (
      pool.pool !== output.pool ||
      pool.fundingMint !== fundingMint ||
      pool.outputMint !== output.mint
    )
      throw new Error("Swap pool differs from the owner-approved basket.");
    return [
      meta(output.mint),
      meta(ata(output.mint, owner), true),
      meta(pool.pool, true),
      meta(pool.ammConfig),
      meta(pool.inputVault, true),
      meta(pool.outputVault, true),
      meta(pool.observation, true),
    ];
  });
}
export function buildGuardProtocolVersionInstruction(): TransactionInstruction {
  return new TransactionInstruction({
    programId: KITE_GUARD_PROGRAM_ID,
    keys: [],
    data: Buffer.from(PROTOCOL),
  });
}

export async function buildGuardCreateInstructions(
  params: BuildGuardCreateParams,
): Promise<{ instructions: TransactionInstruction[]; plan: DevnetGuardPlan }> {
  const [planAddress, bump] = findGuardPlanPda(
    params.owner,
    params.fundingMint,
    params.nonce,
  );
  const subscriptionAuthority = guardSubscriptionAuthority(
    params.owner,
    params.fundingMint,
  ).toBase58();
  const recurringDelegation = guardRecurringDelegation(
    params.owner,
    params.fundingMint,
    params.nonce,
  ).toBase58();
  const plan: DevnetGuardPlan = {
    ...params,
    address: planAddress.toBase58(),
    version: 2,
    devnetMock: params.devnetMock ?? false,
    subscriptionAuthority,
    recurringDelegation,
    bump,
    executedPeriods: 0,
    lastExecutedPeriod: 65535,
    lastExecutedAt: 0n,
    subscriptionInitId: params.expectedInitId ?? 0n,
  };
  validateGuardPlan(plan);
  const [{ address, createNoopSigner }, s] = await Promise.all([
    import("@solana/kit"),
    import("@solana/subscriptions"),
  ]);
  const owner = createNoopSigner(address(params.owner));
  const ownerFunding = ata(params.fundingMint, params.owner),
    planFunding = ata(params.fundingMint, planAddress);
  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      key(params.owner),
      planFunding,
      planAddress,
      key(params.fundingMint),
      TOKEN_PROGRAM_ID,
    ),
  ];
  for (const output of params.outputs)
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        key(params.owner),
        ata(output.mint, params.owner),
        key(params.owner),
        key(output.mint),
        TOKEN_PROGRAM_ID,
      ),
    );
  if (params.initializeAuthority)
    instructions.push(
      kitInstructionToWeb3(
        await s.getInitSubscriptionAuthorityOverlayInstructionAsync({
          owner,
          tokenMint: address(params.fundingMint),
          tokenProgram: address(TOKEN_PROGRAM_ID.toBase58()),
          userAta: address(ownerFunding.toBase58()),
        }),
      ),
    );
  else if (params.expectedInitId === undefined)
    throw new Error("Existing subscription authority generation is required.");
  instructions.push(
    kitInstructionToWeb3(
      await s.getCreateRecurringDelegationOverlayInstructionAsync({
        delegator: owner,
        delegatee: address(plan.address),
        tokenMint: address(params.fundingMint),
        nonce: params.nonce,
        amountPerPeriod: params.fundingAmount,
        periodLengthS: params.periodSeconds,
        startTs: params.startsAt,
        expiryTs: params.expiresAt,
        expectedSubscriptionAuthorityInitId: params.initializeAuthority
          ? s.UNKNOWN_INIT_ID
          : params.expectedInitId,
      }),
    ),
  );
  const count = Buffer.alloc(4);
  count.writeUInt32LE(params.outputs.length);
  const devnetMock = params.devnetMock ?? false;
  const data = Buffer.concat([
    Buffer.from(CREATE),
    u64(params.nonce),
    u64(params.fundingAmount),
    u64(params.periodSeconds),
    i64(params.startsAt),
    i64(params.expiresAt),
    u16(params.periods),
    Buffer.from([devnetMock ? 1 : 0]),
    count,
    ...params.outputs.map((output) =>
      Buffer.concat([
        key(output.mint).toBuffer(),
        u16(output.weightBps),
        u64(output.minimumAmountOut),
      ]),
    ),
  ]);
  instructions.push(
    new TransactionInstruction({
      programId: KITE_GUARD_PROGRAM_ID,
      data,
      keys: [
        meta(params.owner, true, true),
        meta(params.fundingMint),
        meta(subscriptionAuthority),
        meta(recurringDelegation),
        meta(planAddress, true),
        meta(planFunding, true),
        meta(SystemProgram.programId),
        meta(TOKEN_PROGRAM_ID),
      ],
    }),
  );
  return { instructions, plan };
}
export function buildGuardCollectInstructions(
  plan: DevnetGuardPlan,
  pools: DevnetCpmmPool[],
  feePayer: string,
  expectedPeriod: number,
): TransactionInstruction[] {
  validateGuardPlan(plan);
  if (!PublicKey.isOnCurve(key(feePayer).toBytes()))
    throw new Error("A signing fee payer is required.");
  if (
    !Number.isSafeInteger(expectedPeriod) ||
    expectedPeriod < 0 ||
    expectedPeriod >= plan.periods
  )
    throw new Error("Invalid scheduled installment index.");
  return [
    new TransactionInstruction({
      programId: KITE_GUARD_PROGRAM_ID,
      data: Buffer.concat([Buffer.from(COLLECT), u16(expectedPeriod)]),
      keys: [
        meta(feePayer, true, true),
        meta(plan.address, true),
        meta(plan.fundingMint),
        meta(plan.subscriptionAuthority),
        meta(plan.recurringDelegation, true),
        meta(ata(plan.fundingMint, plan.owner), true),
        meta(ata(plan.fundingMint, plan.address), true),
        meta(MAINNET_SUBSCRIPTIONS_PROGRAM),
        meta(subscriptionsEventAuthority()),
        meta(guardMockMintAuthority()),
        meta(TOKEN_PROGRAM_ID),
        ...(plan.devnetMock
          ? mockLegAccounts(plan.owner, plan.outputs)
          : legAccounts(plan.owner, plan.fundingMint, plan.outputs, pools)),
      ],
    }),
  ];
}
export function buildGuardCloseInstructions(
  plan: DevnetGuardPlan,
  delegationRentPayer: string,
): TransactionInstruction[] {
  validateGuardPlan(plan);
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      key(plan.owner),
      ata(plan.fundingMint, plan.owner),
      key(plan.owner),
      key(plan.fundingMint),
      TOKEN_PROGRAM_ID,
    ),
    new TransactionInstruction({
      programId: KITE_GUARD_PROGRAM_ID,
      data: Buffer.from(CLOSE),
      keys: [
        meta(plan.address, true),
        meta(plan.fundingMint),
        meta(plan.owner, true, true),
        meta(delegationRentPayer, true),
        meta(ata(plan.fundingMint, plan.owner), true),
        meta(ata(plan.fundingMint, plan.address), true),
        meta(TOKEN_PROGRAM_ID),
      ],
    }),
  ];
}

export const findGuardPlanV2Pda = findGuardPlanPda;
export const decodeGuardPlanV2 = decodeGuardPlan;
export const validateGuardPlanV2 = validateGuardPlan;
export type DevnetGuardPlanV2 = DevnetGuardPlan;
export type DevnetGuardOutputV2 = DevnetGuardOutput;
