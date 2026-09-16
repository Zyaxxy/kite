/** Validate the devnet-only response consumed by the mobile availability panel. */
export interface DevnetConfig {
  network: "devnet";
  readyToPrepare: boolean;
  reasons: string[];
  stocks: { id: string; available: boolean }[];
  baskets: { id: string; available: boolean }[];
}
export function parseDevnetRecurringConfig(value: unknown): DevnetConfig {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("protocolVersion" in value) ||
    value.protocolVersion !== 2 ||
    !("testTokensOnly" in value) ||
    value.testTokensOnly !== true ||
    !("network" in value) ||
    value.network !== "devnet" ||
    !("readyToPrepare" in value) ||
    typeof value.readyToPrepare !== "boolean" ||
    !("reasons" in value) ||
    !Array.isArray(value.reasons) ||
    !value.reasons.every((reason) => typeof reason === "string")
  )
    throw new Error(
      "The recurring service did not return a valid devnet configuration.",
    );
  const record: Record<string, unknown> = value;
  const targets = (key: "stocks" | "baskets") => {
    const items = record[key];
    if (!Array.isArray(items)) return [];
    return items.flatMap((item: unknown) =>
      item &&
      typeof item === "object" &&
      "id" in item &&
      typeof item.id === "string" &&
      "available" in item &&
      typeof item.available === "boolean"
        ? [{ id: item.id, available: item.available }]
        : [],
    );
  };
  return {
    network: "devnet",
    readyToPrepare: value.readyToPrepare,
    reasons: value.reasons,
    stocks: targets("stocks"),
    baskets: targets("baskets"),
  };
}
