import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sdk from "@kite/sdk";
import type { simulateComposed } from "../lib/server/composed-transactions";
import type { ActualBasketPanel } from "../components/trading/ActualBasketPanel";

const require = createRequire(import.meta.url);
function load<T>(file: string, imports: Record<string, unknown>, extra = {}) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Buffer,
      Date,
      ...extra,
      require: (name: string) => {
        if (name in imports) return imports[name];
        if (
          ["node:crypto", "@solana/web3.js", "react/jsx-runtime"].includes(name)
        )
          return require(name);
        throw new Error(`Unexpected import ${name}`);
      },
    },
  );
  return exports as T;
}

test("composed preflight preserves a specific simulation reason instead of the generic balance/route message", async () => {
  const jupiter = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
  let result = {
    value: { err: "InsufficientFundsForFee" as unknown, logs: [] as string[] },
  };
  const server = load<{ simulateComposed: typeof simulateComposed }>(
    "../lib/server/composed-transactions.ts",
    {
      "@kite/sdk": sdk,
      "./mainnet-connection": {
        getMainnetRpcUrl: () => "https://fixture.invalid",
        MAINNET_GENESIS: "fixture",
      },
    },
    {
      AbortSignal,
      fetch: async () => Response.json({ result }),
    },
  );
  await assert.rejects(server.simulateComposed("fixture"), /Not enough SOL/);
  result = {
    value: {
      err: { InstructionError: [2, { Custom: 6001 }] },
      logs: [
        `Program ${jupiter} invoke [1]`,
        `Program ${jupiter} failed: custom program error: 0x1771`,
      ],
    },
  };
  await assert.rejects(server.simulateComposed("fixture"), /selected slippage/);
  result = {
    value: { err: { InstructionError: [2, { Custom: 9999 }] }, logs: [] },
  };
  await assert.rejects(
    server.simulateComposed("fixture"),
    /instruction 3, program error 9999.*liquidity is unknown/,
  );
  result = { value: { err: null, logs: [] } };
  assert.equal((await server.simulateComposed("fixture")).err, null);
});

test("basket review waits for the active route check but unknown results can still request an exact review", async () => {
  for (const loading of [true, false]) {
    let stateIndex = 0;
    let orderCalls = 0;
    let healthCalls = 0;
    const noOp = () => {};
    const panel = load<{ ActualBasketPanel: typeof ActualBasketPanel }>(
      "../components/trading/ActualBasketPanel.tsx",
      {
        react: {
          useEffect: noOp,
          useRef: (current: unknown) => ({ current }),
          useState: (initial: unknown) => [
            stateIndex++ === 1 ? "100" : initial,
            noOp,
          ],
        },
        "next/link": { default: noOp },
        "@kite/sdk": sdk,
        "./SwapTokenSelector": { SwapTokenSelector: noOp },
        "./swap-tokens.module.css": { default: {} },
        "../ui/native-select": { NativeSelect: noOp },
        "./useWalletPortfolio": {
          useWalletPortfolio: () => ({ refresh: noOp }),
        },
        "./useComposedTransaction": {
          TransactionFeedback: noOp,
          useComposedTransaction: () => ({
            busy: false,
            pending: false,
            setMessage: noOp,
            auth: {
              walletAddress: "fixture-wallet",
              canSign: true,
              supportedTransactionVersions: [0],
            },
          }),
        },
        "../kite/api-client": {
          kiteClient: {
            requestBasketOrder: async () => {
              orderCalls++;
              return {};
            },
          },
        },
        "../kite/RouteHealth": { RouteHealthReport: noOp },
        "../kite/useRouteHealth": {
          useRouteHealth: () => {
            healthCalls++;
            return {
              loading,
              value: null,
              error: loading ? "" : "Availability unknown",
            };
          },
        },
      },
    );
    const tree = panel.ActualBasketPanel({
      basket: { id: "fixture", assets: [] } as unknown as sdk.MarketBasket,
    });
    type Element = {
      type?: unknown;
      props?: {
        children?: unknown;
        disabled?: boolean;
        onClick?: () => Promise<void>;
      };
    };
    const elements: Element[] = [];
    function visit(node: unknown) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (node && typeof node === "object" && "props" in node) {
        const element = node as Element;
        elements.push(element);
        visit(element.props?.children);
      }
    }
    visit(tree);
    const review = elements.find(
      (element) =>
        element.type === "button" &&
        ["Waiting for route check…", "Review basket purchase"].includes(
          String(element.props?.children),
        ),
    )!;
    assert.ok(review);
    assert.equal(review.props?.disabled, loading);
    await review.props?.onClick?.();
    assert.equal(orderCalls, loading ? 0 : 1);
    assert.equal(
      healthCalls,
      1,
      "one route check powers both the report and review gate",
    );
  }
});
