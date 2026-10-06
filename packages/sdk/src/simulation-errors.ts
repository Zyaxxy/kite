const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const SYSTEM = "11111111111111111111111111111111";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

/** Safe user-facing reasons, never raw RPC/provider logs or unscoped custom codes. */
export function describeSimulationFailure(
  error: unknown,
  logs?: unknown,
): string {
  const data =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const instruction = Array.isArray(data.InstructionError)
    ? data.InstructionError
    : [];
  const reason = instruction[1];
  const custom =
    reason && typeof reason === "object"
      ? (reason as Record<string, unknown>).Custom
      : undefined;
  // A CPI error can bubble through Jupiter. Decode against the FIRST failing program,
  // not the outer router or an earlier successful instruction's log entries.
  const lines = Array.isArray(logs)
    ? logs
        .slice(0, 2000)
        .filter((line): line is string => typeof line === "string")
    : [];
  let topLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^Program [1-9A-HJ-NP-Za-km-z]+ invoke \[1\]$/.test(lines[i]))
      topLevel = i;
  }
  const failed = lines
    .slice(Math.max(0, topLevel))
    .find((line) => /^Program [1-9A-HJ-NP-Za-km-z]+ failed:/.test(line));
  const failure = failed?.match(
    /^Program ([1-9A-HJ-NP-Za-km-z]+) failed: custom program error: (0x[0-9a-f]+|[0-9]+)$/i,
  );
  const failedProgram =
    failure && Number(failure[2]) === custom ? failure[1] : undefined;
  if (failedProgram === SYSTEM && custom === 1)
    return "Not enough SOL to cover this transaction, including any SOL purchase amount, fees and token-account rent. Add SOL or reduce the purchase amount if paying with SOL, then review again.";
  if (
    error === "InsufficientFundsForFee" ||
    "InsufficientFundsForRent" in data ||
    reason === "InsufficientFundsForRent"
  )
    return "Not enough SOL for transaction fees or token-account rent. Add SOL to this wallet, or reduce the purchase amount if paying with SOL, then review again.";
  if (
    reason === "InsufficientFunds" ||
    (failedProgram === JUPITER && custom === 6024) ||
    (failedProgram && TOKEN_PROGRAMS.has(failedProgram) && custom === 1)
  )
    return "The swap reported insufficient funds. Reduce the purchase amount or add the funding token, and keep SOL available for fees and token-account rent. Then review again.";
  // Jupiter codes: https://developers.jup.ag/docs/swap/v1/common-errors
  if (failedProgram === JUPITER && (custom === 6001 || custom === 6017))
    return "The route cannot meet your minimum output at the selected slippage. Refresh the review, try a smaller amount or another funding token, or wait for liquidity to improve. Slippage was not changed.";
  if (error === "BlockhashNotFound")
    return "The transaction's blockhash expired or is unavailable on the RPC. Refresh the review to build a new transaction.";
  if (reason === "ComputationalBudgetExceeded")
    return "This route exceeded the transaction's compute limit. Try another funding token, or retry later for a different route. No transaction was submitted.";
  if (
    error === "TooManyAccountLocks" ||
    error === "MaxLoadedAccountsDataSizeExceeded"
  )
    return "This route exceeds transaction account or data limits. Try another funding token or adjust a custom basket. No transaction was submitted.";
  if (
    error === "AccountNotFound" ||
    reason === "InvalidAccountData" ||
    reason === "UninitializedAccount" ||
    (failedProgram === JUPITER &&
      (custom === 6025 || custom === 6014 || custom === 6008))
  )
    return "A required route or token account is missing or incompatible. Try another funding token or refresh the review. This is not a confirmed liquidity failure.";
  const index =
    Number.isSafeInteger(instruction[0]) && instruction[0] >= 0
      ? instruction[0] + 1
      : null;
  const code =
    Number.isSafeInteger(custom) && Number(custom) >= 0
      ? `, program error ${custom}`
      : "";
  return `Mainnet simulation failed${index === null ? "" : ` at instruction ${index}${code}`}. The cause could not be identified safely; route liquidity is unknown. Refresh the review or try another funding token. If it repeats, contact support with this message.`;
}
