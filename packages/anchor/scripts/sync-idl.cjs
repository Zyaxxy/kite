#!/usr/bin/env node
// Uses compiled Anchor macros. This command never loads a wallet or deploys a program.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { convertIdlToCamelCase } = require('@anchor-lang/core/dist/cjs/idl.js');
const anchorRoot = path.resolve(__dirname, '..');
const sdkRoot = path.resolve(anchorRoot, '../sdk/src/guard');
const env = { ...process.env };
// anchor-lang-idl 0.1.4 incorrectly interpolates an inherited RUSTUP_TOOLCHAIN.
// Use the user's configured default toolchain for the generated subprocess.
delete env.RUSTUP_TOOLCHAIN;
const build = spawnSync('cargo', ['build', '--manifest-path', path.join(anchorRoot, 'Cargo.toml'), '-p', 'kite_guard', '--example', 'generate_idl'], { env, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const generated = spawnSync(path.join(anchorRoot, 'target/debug/examples/generate_idl'), [], { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (generated.status !== 0) { process.stderr.write(generated.stderr || 'IDL generation failed.\n'); process.exit(generated.status ?? 1); }
const idl = JSON.parse(generated.stdout);
const files = [
  [path.join(sdkRoot, 'kite_guard.json'), JSON.stringify(idl, null, 2) + '\n'],
  [path.join(sdkRoot, 'kite_guard.ts'), '// Generated from the Rust Anchor IDL. Run packages/anchor/scripts/sync-idl.cjs.\nexport type KiteGuard = ' + JSON.stringify(convertIdlToCamelCase(idl), null, 2) + ';\n'],
];
for (const [file, content] of files) {
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) throw new Error(`Generated IDL differs: ${file}`);
  } else fs.writeFileSync(file, content);
}
console.log(process.argv.includes('--check') ? 'Guard IDL and TypeScript match Rust.' : 'Updated Guard IDL and TypeScript from Rust.');
