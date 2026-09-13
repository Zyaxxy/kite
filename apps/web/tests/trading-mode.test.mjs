import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(
  new URL("../../mobile/package.json", import.meta.url),
)("jsdom");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { renderToString } = require("react-dom/server");
const { act } = React;
const KEY = "kite.trading.mode.v1";
function load(file, imports = {}) {
  const compiled = ts.transpileModule(
    readFileSync(
      new URL(`../components/kite/${file}`, import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const exports = {};
  runInThisContext(`(function(require, exports) { ${compiled}\n})`)(
    (name) => imports[name] ?? require(name),
    exports,
  );
  return exports;
}
const { useTradingMode } = load("useTradingMode.ts");
const Context = React.createContext(null);
const { TradingModeSwitch } = load("TradingModeSwitch.tsx", {
  "./State": { useKite: () => React.useContext(Context) },
});
function DeepLink() {
  const { setMode } = React.useContext(Context);
  React.useEffect(() => setMode("actual"), [setMode]);
  return null;
}
function Harness({ deepLink = false }) {
  const [mode, setMode] = useTradingMode();
  return React.createElement(
    Context.Provider,
    { value: { mode, setMode } },
    deepLink && React.createElement(DeepLink),
    React.createElement(TradingModeSwitch),
  );
}
async function fixture(t, { saved, blocked = false, deepLink = false } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "https://kite.test",
  });
  const originals = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  if (saved !== undefined) dom.window.localStorage.setItem(KEY, saved);
  if (blocked)
    Object.defineProperty(dom.window, "localStorage", {
      get() {
        throw new Error("Storage disabled");
      },
    });
  let root = createRoot(dom.window.document.getElementById("root"));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () =>
    root.render(React.createElement(Harness, { deepLink })),
  );
  return {
    document: dom.window.document,
    mode: () => dom.window.document.querySelector("input:checked").value,
    saved: () => dom.window.localStorage.getItem(KEY),
    choose: async (value) =>
      act(async () =>
        dom.window.document.querySelector(`input[value="${value}"]`).click(),
      ),
    remount: async () => {
      await act(async () => root.unmount());
      root = createRoot(dom.window.document.getElementById("root"));
      await act(async () => root.render(React.createElement(Harness)));
    },
  };
}
test("SSR defaults to paper without accessing browser storage", () => {
  assert.match(
    renderToString(React.createElement(Harness)),
    /data-mode="paper"/,
  );
});
test("header selection persists across remounts and selecting the active segment is idempotent", async (t) => {
  const view = await fixture(t);
  assert.equal(view.mode(), "paper");
  await view.choose("actual");
  assert.equal(view.mode(), "actual");
  assert.equal(view.saved(), "actual");
  await view.choose("actual");
  assert.equal(view.mode(), "actual");
  await view.remount();
  assert.equal(view.mode(), "actual");
  await view.choose("paper");
  assert.equal(view.saved(), "paper");
  assert.equal(view.document.querySelectorAll('[role="radiogroup"]').length, 1);
  assert.equal(
    view.document.querySelectorAll('input[aria-label$="trading"]').length,
    2,
  );
});
test("invalid saved modes leave the safe paper default", async (t) => {
  const view = await fixture(t, { saved: "invalid" });
  assert.equal(view.mode(), "paper");
});
test("disabled storage does not prevent switching within a session", async (t) => {
  const view = await fixture(t, { blocked: true });
  await view.choose("actual");
  assert.equal(view.mode(), "actual");
  await view.choose("paper");
  assert.equal(view.mode(), "paper");
});
test("an explicit stock deep link wins over a saved paper preference during hydration", async (t) => {
  const view = await fixture(t, { saved: "paper", deepLink: true });
  assert.equal(view.mode(), "actual");
  assert.equal(view.saved(), "actual");
});
