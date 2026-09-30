import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const appDirectory = fileURLToPath(new URL("../app/", import.meta.url));
let pathname = "/";

// Exercise the real wallet context without loading Privy, discovering browser wallets,
// or making RPC calls. Only Next's client loader and unrelated app state are stubbed.
function WalletBoundary({ children }: { children: ReactNode }) {
  return React.createElement(ConnectionProvider, {
    endpoint: "http://127.0.0.1:8899",
    children: React.createElement(WalletProvider, {
      wallets: [],
      autoConnect: false,
      children: React.createElement(
        "section",
        { "data-wallet-provider": true },
        children,
      ),
    }),
  });
}
const exports: { Providers?: React.ComponentType<{ children: ReactNode }> } =
  {};
runInNewContext(
  ts.transpileModule(readFileSync(`${appDirectory}providers.tsx`, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText,
  {
    exports,
    require: (name: string) => {
      if (name === "next/navigation") return { usePathname: () => pathname };
      if (name === "next/dynamic")
        return (_loader: unknown, options: { ssr: boolean }) => {
          assert.equal(
            options.ssr,
            false,
            "wallet providers must remain client-only",
          );
          return WalletBoundary;
        };
      if (name === "../components/kite/State")
        return { KiteProvider: React.Fragment };
      return require(name);
    },
  },
);
const Providers = exports.Providers!;
function WalletConsumer() {
  const { wallet, publicKey } = useWallet();
  assert.equal(wallet, null);
  assert.equal(publicKey, null);
  return React.createElement("button", null, "Select Wallet");
}
function render(path: string, walletConsumer = true) {
  pathname = path;
  return renderToStaticMarkup(
    React.createElement(Providers, {
      children: walletConsumer
        ? React.createElement(WalletConsumer)
        : "Public content",
    }),
  );
}
test("direct creator navigation supplies wallet context before any wallet consumer renders", (t) => {
  const errors = t.mock.method(console, "error", () => undefined);
  assert.match(render("/creators"), /data-wallet-provider="true"/);
  assert.equal(
    errors.mock.calls.filter(({ arguments: args }) =>
      args.some((value) => String(value).includes("WalletContext")),
    ).length,
    0,
  );
});
test("every current workspace page receives wallet context, including dynamic detail routes", (t) => {
  const errors = t.mock.method(console, "error", () => undefined);
  const workspacePages = readdirSync(appDirectory, {
    recursive: true,
    encoding: "utf8",
  })
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file.endsWith("/page.tsx") || file === "page.tsx")
    .filter((file) =>
      /<(?:KiteApp|Shell)\b/.test(
        readFileSync(`${appDirectory}${file}`, "utf8"),
      ),
    );
  assert.ok(workspacePages.includes("creators/page.tsx"));
  assert.ok(workspacePages.includes("basket/builder/page.tsx"));
  for (const file of workspacePages) {
    const route = `/${file.replace(/\/page\.tsx$/, "").replace(/\[[^\]]+\]/g, "example")}`;
    assert.match(render(route), /data-wallet-provider="true"/, route);
  }
  assert.equal(
    errors.mock.calls.filter(({ arguments: args }) =>
      args.some((value) => String(value).includes("WalletContext")),
    ).length,
    0,
  );
});
test("landing and policy pages retain their lightweight public provider path", () => {
  for (const route of ["/", "/landing", "/privacy", "/terms"])
    assert.equal(render(route, false), "Public content");
});
