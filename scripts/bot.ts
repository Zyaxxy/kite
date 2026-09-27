/** Cron is a narrow authenticated trigger. All signing, leases and retry journals live on the web server. */
async function triggerCollector(): Promise<void> {
  const secret =
    process.env.KITE_RECURRING_EXECUTOR_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32)
    throw new Error(
      "Configure KITE_RECURRING_EXECUTOR_SECRET (at least 32 characters).",
    );
  const base = new URL(process.env.KITE_WEB_URL || "http://localhost:3000");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    (base.protocol !== "https:" && !(local && base.protocol === "http:")) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  ) {
    throw new Error(
      "KITE_WEB_URL must be a canonical HTTPS origin, or HTTP loopback for development.",
    );
  }
  const response = await fetch(new URL("/api/recurring/collect", base), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(55_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ trigger: "cron" }),
  });
  if (response.status === 409) {
    console.log("Another recurring collection pass is already running.");
    return;
  }
  if (!response.ok)
    throw new Error(
      `Recurring collector returned HTTP ${response.status}. Check server configuration and executor authorization.`,
    );
  const result = (await response.json()) as Record<string, unknown>;
  if (
    result.status !== "ok" ||
    !Number.isInteger(result.scanned) ||
    !Number.isInteger(result.failed)
  )
    throw new Error("The collector returned an unexpected response.");
  console.log(
    JSON.stringify({
      network: "devnet",
      scanned: result.scanned,
      confirmed: result.collected,
      pending: result.pending,
      failed: result.failed,
      deferred: result.deferred,
    }),
  );
  if (Number(result.failed) > 0) process.exitCode = 1;
}

triggerCollector().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Unable to trigger the recurring collector.",
  );
  process.exitCode = 1;
});
