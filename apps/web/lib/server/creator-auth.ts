import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  validateProgrammableBasket,
  type ProgrammableBasket,
  type PublishedCreatorBasket,
} from "@kite/sdk";
import { CreatorServiceError } from "./creator-store";

interface Approval {
  version: 1;
  wallet: string;
  origin: string;
  nonce: string;
  expiresAt: number;
  basket: PublishedCreatorBasket;
}
const digest = (value: string) => createHash("sha256").update(value).digest();
function authSecret(): string {
  const secret = process.env.CREATOR_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new CreatorServiceError(
      "Creator authorization is not configured. Private drafts still work.",
    );
  return secret;
}
export function creatorPublishingConfigured(): boolean {
  return Boolean(
    process.env.CREATOR_AUTH_SECRET &&
    process.env.CREATOR_AUTH_SECRET.length >= 32 &&
    process.env.CREATOR_INVITE_CODES?.split(",").some((v) => v.trim()),
  );
}
export function validateCreatorInvite(invite: unknown): boolean {
  if (typeof invite !== "string" || !invite.trim() || invite.length > 256)
    return false;
  const candidate = digest(invite.trim());
  const codes = (process.env.CREATOR_INVITE_CODES ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  // No code is persisted or consumed: all configured codes remain multi-use.
  return (
    codes.reduce(
      (matched, code) =>
        Number(timingSafeEqual(candidate, digest(code))) | matched,
      0,
    ) === 1
  );
}
export function validateCreatorWallet(value: unknown): string {
  if (typeof value !== "string" || value.length > 44)
    throw new CreatorServiceError("Connect a valid Solana wallet.", 400);
  try {
    const address = new PublicKey(value);
    if (!PublicKey.isOnCurve(address.toBytes())) throw new Error();
    return address.toBase58();
  } catch {
    throw new CreatorServiceError("Connect a valid signing wallet.", 400);
  }
}
export function creatorApprovalMessage(approval: Approval): string {
  return [
    "Kite — publish a creator basket",
    `Site: ${approval.origin}`,
    `Wallet: ${approval.wallet}`,
    `Basket: ${approval.basket.name} (${approval.basket.ticker})`,
    ...approval.basket.allocations.map(
      (a) => `${a.symbol}: ${a.weightBps} basis points · ${a.mint}`,
    ),
    `Content: ${digest(JSON.stringify(approval.basket)).toString("hex")}`,
    `Expires: ${new Date(approval.expiresAt).toISOString()}`,
    `Nonce: ${approval.nonce}`,
    "This signature publishes this allocation. It does not transfer tokens or authorize trading.",
  ].join("\n");
}
export function prepareCreatorApproval(
  input: ProgrammableBasket,
  wallet: string,
  origin: string,
  now = Date.now(),
) {
  const valid = validateProgrammableBasket(input);
  const timestamp = new Date(now).toISOString();
  const content = {
    name: valid.name,
    ticker: valid.ticker,
    description: valid.description,
    category: valid.category,
    allocations: valid.allocations,
    creatorName: valid.creatorName,
    creatorSocial: valid.creatorSocial,
    rebalanceRules: valid.rebalanceRules,
  };
  const id = `creator-${digest(JSON.stringify({ wallet, ...content }))
    .toString("hex")
    .slice(0, 24)}`;
  const basket: PublishedCreatorBasket = {
    ...valid,
    id,
    creatorWallet: wallet,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: timestamp,
  };
  const approval: Approval = {
    version: 1,
    wallet,
    origin,
    nonce: randomBytes(24).toString("hex"),
    expiresAt: now + 5 * 60_000,
    basket,
  };
  const payload = Buffer.from(JSON.stringify(approval)).toString("base64url");
  const token = `${payload}.${createHmac("sha256", authSecret()).update(payload).digest("base64url")}`;
  return {
    token,
    message: creatorApprovalMessage(approval),
    expiresAt: approval.expiresAt,
    basket,
  };
}
export function verifyCreatorApproval(
  token: unknown,
  signature: unknown,
  origin: string,
  now = Date.now(),
): Approval {
  if (
    typeof token !== "string" ||
    token.length > 20_000 ||
    typeof signature !== "string" ||
    signature.length > 100
  )
    throw new CreatorServiceError("Invalid publishing approval.", 400);
  const parts = token.split(".");
  const [payload, mac] = parts;
  if (!payload || !mac || parts.length !== 2)
    throw new CreatorServiceError("Invalid publishing approval.", 400);
  const expected = createHmac("sha256", authSecret()).update(payload).digest();
  const received = Buffer.from(mac, "base64url");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    throw new CreatorServiceError(
      "The reviewed basket was changed. Review it again.",
      401,
    );
  const approval = JSON.parse(
    Buffer.from(payload, "base64url").toString(),
  ) as Approval;
  if (
    approval.version !== 1 ||
    approval.origin !== origin ||
    approval.expiresAt <= now ||
    approval.expiresAt > now + 5 * 60_000
  )
    throw new CreatorServiceError(
      "This approval expired or belongs to another site. Review again.",
      401,
    );
  const owner = validateCreatorWallet(approval.wallet);
  const publicKey = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      new PublicKey(owner).toBuffer(),
    ]),
    format: "der",
    type: "spki",
  });
  const bytes = Buffer.from(signature, "base64");
  if (
    bytes.length !== 64 ||
    !verify(
      null,
      Buffer.from(creatorApprovalMessage(approval)),
      publicKey,
      bytes,
    )
  )
    throw new CreatorServiceError(
      "The signature does not match the basket owner.",
      401,
    );
  return approval;
}
