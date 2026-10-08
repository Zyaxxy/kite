import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("landing fundamentals have stable, distinct keys for each reporting period", () => {
  const source = ts.createSourceFile(
    "LandingResearch.tsx",
    readFileSync(
      new URL("../components/kite/LandingResearch.tsx", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const expressions: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(source) === "key" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression
    ) {
      const expression = node.initializer.expression.getText(source);
      if (expression.includes("item.periodEnd")) expressions.push(expression);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(
    expressions.length,
    1,
    "Exercise the actual fundamental row key",
  );
  const key = runInNewContext(`(item) => ${expressions[0]}`) as (item: {
    id: string;
    period: string;
    periodEnd: string;
  }) => string;
  const reports = [
    { id: "annualTotalRevenue", period: "annual", periodEnd: "2025-12-31" },
    { id: "annualTotalRevenue", period: "annual", periodEnd: "2024-12-31" },
    { id: "annualTotalRevenue", period: "annual", periodEnd: "2023-12-31" },
    { id: "annualTotalRevenue", period: "quarterly", periodEnd: "2025-12-31" },
  ];
  const keys = reports.map(key);
  assert.equal(new Set(keys).size, reports.length);
  assert.deepEqual([...reports].reverse().map(key), [...keys].reverse());
  assert.equal(key({ ...reports[0] }), keys[0]);
});
