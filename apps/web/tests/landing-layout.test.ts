import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function parse(name: string) {
  return ts.createSourceFile(
    name,
    readFileSync(
      new URL(`../components/kite/${name}`, import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function elements(source: ts.SourceFile, tag: string) {
  const matches: Array<ts.JsxElement | ts.JsxSelfClosingElement> = [];
  function visit(node: ts.Node) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(source) === tag
    )
      matches.push(node);
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(source) === tag
    )
      matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return matches;
}

function sectionId(node: ts.JsxElement) {
  const attribute = node.openingElement.attributes.properties.find(
    (property) =>
      ts.isJsxAttribute(property) && property.name.getText() === "id",
  );
  return attribute &&
    ts.isJsxAttribute(attribute) &&
    attribute.initializer &&
    ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text
    : null;
}

test("market snapshot is the research chapter's unpinned conclusion, not a hero band", () => {
  const source = parse("Landing.tsx");
  const markets = elements(source, "LandingMarket");
  assert.equal(markets.length, 1);
  assert(ts.isJsxElement(markets[0].parent));
  assert.equal(sectionId(markets[0].parent), "research");
  const research = markets[0].parent;
  const story = research.children.find(
    (child) =>
      ts.isJsxElement(child) &&
      child.openingElement.getText(source).includes("data-scroll-lock"),
  );
  assert(story);
  assert(markets[0].getStart(source) > story.end);
});

test("one combined source section follows how-it-works and precedes FAQ", () => {
  const source = parse("Landing.tsx");
  const sources = elements(source, "LandingSources");
  assert.equal(sources.length, 1);
  const how = elements(source, "section").find(
    (node) => ts.isJsxElement(node) && sectionId(node) === "how-it-works",
  );
  const faq = elements(source, "section").find(
    (node) =>
      ts.isJsxElement(node) &&
      node.openingElement
        .getText(source)
        .includes('aria-labelledby="faq-title"'),
  );
  assert(how && faq);
  assert(sources[0].getStart(source) > how.end);
  assert(sources[0].end < faq.getStart(source));
  assert.equal(source.text.includes("styles.catalogStrip"), false);
  assert.equal(source.text.includes("styles.toolsRow"), false);
});

test("combined sources retain separate issuer and infrastructure roles", () => {
  const source = parse("LandingSources.tsx");
  assert(source.text.includes('aria-labelledby="landing-issuers-title"'));
  assert(source.text.includes('aria-labelledby="landing-tools-title"'));
  for (const name of ["xStocks", "PreStocks", "Backpack", "Jupiter", "Pyth"])
    assert(source.text.includes(name));
  assert(source.text.includes("Availability and eligibility vary"));
  assert(source.text.includes("where available"));
  assert(source.text.includes("do not imply endorsement"));
});

test("landing has one footer containing the final CTA and privacy controls", () => {
  const source = parse("Landing.tsx");
  const footers = elements(source, "footer");
  assert.equal(footers.length, 1);
  assert(ts.isJsxElement(footers[0]));
  const footer = footers[0].getText(source);
  assert(footer.includes("styles.footerCta"));
  assert(footer.includes("PrivacyChoicesButton"));
  assert(footer.includes('href="/settings"'));
  assert.equal(source.text.includes("styles.finalCta"), false);
  const privacy = parse("PrivacyChoices.tsx");
  assert(privacy.text.includes('pathname === "/" || pathname === "/landing"'));
  const globalFooter = elements(privacy, "footer")[0];
  let condition = globalFooter.parent;
  while (ts.isParenthesizedExpression(condition)) condition = condition.parent;
  assert(ts.isBinaryExpression(condition));
  assert.equal(condition.left.getText(privacy), "!landing");
  assert.equal(elements(privacy, "section").length, 2);
});

test("scroll timelines read pin progress on both scroll and layout refresh", () => {
  const source = parse("landing-motion.ts");
  const drivers: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "ScrollTrigger.create"
    )
      drivers.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(drivers.length, 2);
  for (const driver of drivers) {
    const config = driver.arguments[0];
    assert(ts.isObjectLiteralExpression(config));
    const update = config.properties.find(
      (property) => property.name?.getText(source) === "onUpdate",
    );
    const refresh = config.properties.find(
      (property) => property.name?.getText(source) === "onRefresh",
    );
    assert(update && refresh);
    assert(refresh.getText(source).includes("render(self"));
  }
  const css = readFileSync(
    new URL("../components/kite/Landing.module.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.site\s*\{[^}]*overflow-anchor:\s*none/);
  assert.match(css, /\.researchBody\s*\{[^}]*height:\s*207px/);
  assert.match(css, /\.researchSources\s*\{[^}]*height:\s*76px/);
});
