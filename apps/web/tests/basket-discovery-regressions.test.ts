import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sdk from "@kite/sdk";
import type { useBaskets } from "../components/kite/useBaskets";
import type { useRouteHealth } from "../components/kite/useRouteHealth";

function load<T>(file: string, imports: Record<string, unknown>) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name: string) => {
        if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
        return imports[name];
      },
    },
  );
  return exports as T;
}

test("All Themes keeps the full catalog when route coverage is empty or only one basket is featured", () => {
  for (const coverage of [[], [{ basketId: "sol-core", featured: true }]]) {
    const hooks = load<{ useBaskets: typeof useBaskets }>(
      "../components/kite/useBaskets.ts",
      {
        react: { useMemo: (fn: () => unknown) => fn() },
        "@kite/sdk": sdk,
        "./State": {
          useKite: () => ({ snapshot: { assets: [] }, customBaskets: [] }),
        },
        "./creator-client": { usePublishedBaskets: () => ({ baskets: [] }) },
        "./useRouteHealth": { useRouteCoverage: () => coverage },
      },
    );
    const baskets = hooks.useBaskets();
    assert.deepEqual(
      Array.from(baskets, (basket) => basket.id).sort(),
      sdk
        .resolveAllMarketBaskets([])
        .map((basket) => basket.id)
        .sort(),
    );
    assert.ok(baskets.some((basket) => basket.id === "sol-energy"));
    assert.ok(baskets.some((basket) => basket.id === "sol-digital-economy"));
    assert.ok(baskets.some((basket) => !basket.available));
  }
});

test("route-health render props never contain React's reserved key, including loaded and changed-request states", () => {
  const input = {
    basketId: "sol-core",
    inputMint: sdk.MAINNET_USDC_MINT,
    amount: "100",
    slippageBps: 100,
  };
  for (const matches of [true, false]) {
    let stateCalls = 0;
    const hooks = load<{ useRouteHealth: typeof useRouteHealth }>(
      "../components/kite/useRouteHealth.ts",
      {
        react: {
          useEffect: () => {},
          useState: (initial: unknown) => {
            stateCalls++;
            return [
              stateCalls === 2
                ? {
                    key: matches ? JSON.stringify(input) : "different request",
                    value: null,
                    loading: false,
                    error: "",
                  }
                : initial,
              () => {},
            ];
          },
        },
        "./api-client": { kiteClient: {} },
      },
    );
    const result = hooks.useRouteHealth(input);
    assert.equal("key" in result, false);
    assert.equal(result.loading, !matches);
  }
});
