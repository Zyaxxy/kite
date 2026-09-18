const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("mobile workspace includes official Kite icon.svg and uses it for the brand logo", () => {
  const webIconPath = path.resolve(__dirname, "../../web/app/icon.svg");
  const mobileIconPath = path.resolve(__dirname, "../assets/icon.svg");
  const mobilePublicIconPath = path.resolve(__dirname, "../public/icon.svg");

  assert.ok(fs.existsSync(webIconPath), "web icon.svg must exist");
  assert.ok(fs.existsSync(mobileIconPath), "mobile assets/icon.svg must exist");
  assert.ok(fs.existsSync(mobilePublicIconPath), "mobile public/icon.svg must exist");

  const webIcon = fs.readFileSync(webIconPath, "utf8").trim();
  const mobileIcon = fs.readFileSync(mobileIconPath, "utf8").trim();
  assert.equal(mobileIcon, webIcon, "mobile icon.svg must match the official Kite icon.svg");

  const navSource = fs.readFileSync(path.resolve(__dirname, "../src/components/Navigation.tsx"), "utf8");
  assert.ok(navSource.includes("KiteLogo"), "Navigation.tsx must use KiteLogo component");
  assert.ok(!navSource.includes("brandMark"), "Navigation.tsx must not use placeholder brandMark");

  const logoSource = fs.readFileSync(path.resolve(__dirname, "../src/components/KiteLogo.tsx"), "utf8");
  assert.ok(logoSource.includes('assets/icon.svg'), "KiteLogo must reference assets/icon.svg");
});
