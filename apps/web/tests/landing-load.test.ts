import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { landingMetadata } from "../lib/metadata";

for (const path of ["../app/page.tsx", "../app/landing/page.tsx"]) {
  function route(failed = false) {
    const compiled = ts.transpileModule(
      readFileSync(new URL(path, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText;
    const snapshot = {
      assets: [],
      status: "partial",
      asOf: "2026-10-07T00:00:00Z",
    };
    const pending = new Promise<void>(() => {});
    const callbacks: Array<() => Promise<unknown>> = [];
    const exports: { default?: () => Promise<any>; dynamic?: string } = {};
    runInNewContext(compiled, {
      exports,
      require(name: string) {
        if (name === "react/jsx-runtime")
          return { jsx: (type: unknown, props: unknown) => ({ type, props }) };
        if (name.endsWith("components/kite/Landing"))
          return { Landing: "Landing" };
        if (name.endsWith("lib/metadata")) return { landingMetadata };
        if (name === "next/server")
          return {
            after: (callback: () => Promise<unknown>) =>
              callbacks.push(callback),
          };
        if (name === "@/lib/server/markets")
          return {
            async getServerMarkets(options?: {
              waitUntil?: (task: Promise<unknown>) => void;
            }) {
              if (failed) throw new Error("Market provider unavailable");
              assert.equal(
                typeof options?.waitUntil,
                "function",
                "Landing opts into the existing background refresh path",
              );
              options!.waitUntil!(pending);
              return snapshot;
            },
          };
        throw new Error(`Unexpected landing dependency: ${name}`);
      },
    });
    return { exports, snapshot, pending, callbacks };
  }

  test(`${path}: observed data renders without awaiting the price refresh`, async () => {
    const { exports, snapshot, pending, callbacks } = route();
    const result = await exports.default!();
    assert.equal(result.type, "Landing");
    assert.equal(result.props.initialSnapshot, snapshot);
    assert.equal(callbacks.length, 1);
    assert.equal(
      callbacks[0](),
      pending,
      "Next after owns the original background task",
    );
    assert.equal(exports.dynamic, "force-dynamic");
  });

  test(`${path}: provider failure does not synthesize a snapshot`, async () => {
    const { exports, callbacks } = route(true);
    const result = await exports.default!();
    assert.equal(result.props.initialSnapshot, null);
    assert.equal(callbacks.length, 0);
  });
}
