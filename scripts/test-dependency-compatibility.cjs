const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { test } = require("node:test");

const mobileRequire = createRequire(
  path.resolve(__dirname, "../apps/mobile/package.json"),
);
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));
const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
const tar = cliRequire("tar");
const cliRoot = path.dirname(expoRequire.resolve("@expo/cli/package.json"));

test("patched Expo CLI extracts files and template streams with tar 7", async () => {
  assert.equal(cliRequire("tar/package.json").version, "7.5.21");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "kite-tar-compat-"),
  );
  try {
    const source = path.join(directory, "source");
    const archive = path.join(directory, "template.tar");
    await fs.mkdir(path.join(source, "package"), { recursive: true });
    await fs.writeFile(
      path.join(source, "package", "message.txt"),
      "Kite extraction fixture",
    );
    await tar.create({ file: archive, cwd: source }, ["package"]);

    const templateOutput = path.join(directory, "template");
    const { extractLocalNpmTarballAsync } = require(
      path.join(cliRoot, "build/src/utils/npm.js"),
    );
    const digest = await extractLocalNpmTarballAsync(archive, {
      cwd: templateOutput,
    });
    assert.match(digest, /^[a-f0-9]{32}$/);
    assert.equal(
      await fs.readFile(path.join(templateOutput, "message.txt"), "utf8"),
      "Kite extraction fixture",
    );

    const fallbackOutput = path.join(directory, "fallback");
    await fs.mkdir(fallbackOutput);
    const { extractAsync } = require(
      path.join(cliRoot, "build/src/utils/tar.js"),
    );
    // Exercise the CLI's JS fallback instead of accepting the system tar path.
    // This process is dedicated to the smoke test; always restore the descriptor.
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
    try {
      Object.defineProperty(process, "platform", {
        ...descriptor,
        value: "win32",
      });
      await extractAsync(archive, fallbackOutput);
    } finally {
      Object.defineProperty(process, "platform", descriptor);
    }
    assert.equal(
      await fs.readFile(
        path.join(fallbackOutput, "package/message.txt"),
        "utf8",
      ),
      "Kite extraction fixture",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Expo plist and cacache consumers preserve their existing APIs", async () => {
  const plistModule = cliRequire("@expo/plist");
  const plist = plistModule.default ?? plistModule;
  const plistRequire = createRequire(
    cliRequire.resolve("@expo/plist/package.json"),
  );
  assert.equal(plistRequire("@xmldom/xmldom/package.json").version, "0.8.15");
  const record = {
    CFBundleDisplayName: "Kite",
    Enabled: true,
    Supported: ["solana"],
  };
  assert.deepEqual(plist.parse(plist.build(record)), record);

  const cacache = cliRequire("cacache");
  const cacheRequire = createRequire(
    cliRequire.resolve("cacache/package.json"),
  );
  assert.equal(cacheRequire("tar/package.json").version, "7.5.21");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "kite-cache-compat-"),
  );
  try {
    await cacache.put(directory, "fixture", "verified cache content");
    assert.equal(
      (await cacache.get(directory, "fixture")).data.toString(),
      "verified cache content",
    );
    const result = await cacache.verify(directory);
    assert.equal(result.verifiedContent, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
