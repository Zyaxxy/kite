const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PublicKey, SystemProgram } = require("@solana/web3.js");
const {
  MintLayout,
  MINT_SIZE,
  ACCOUNT_SIZE,
  AccountType,
  ExtensionType,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");
const {
  createMainnetMintPrecisionResolver,
} = require("../dist/mint-precision.js");

const MAINNET = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const mint = new PublicKey(Buffer.alloc(32, 7));

// Binary account fixtures exercise the SPL decoder; these are never runtime market data.
function mintAccount({
  decimals = 8,
  initialized = true,
  token2022 = false,
} = {}) {
  const data = Buffer.alloc(token2022 ? ACCOUNT_SIZE + 1 + 4 + 64 : MINT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: 0,
      mintAuthority: PublicKey.default,
      supply: 1000n,
      decimals,
      isInitialized: initialized,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data,
  );
  if (token2022) {
    data[ACCOUNT_SIZE] = AccountType.Mint;
    data.writeUInt16LE(ExtensionType.MetadataPointer, ACCOUNT_SIZE + 1);
    data.writeUInt16LE(64, ACCOUNT_SIZE + 3);
  }
  return {
    data,
    owner: token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    executable: false,
    lamports: 1,
    rentEpoch: 0,
  };
}

test("reads authoritative precision from initialized SPL and extended Token-2022 mints", async () => {
  for (const token2022 of [false, true]) {
    for (const decimals of [0, 8, 18]) {
      const resolve = createMainnetMintPrecisionResolver({
        getGenesisHash: async () => MAINNET,
        getAccountInfo: async (address, commitment) => {
          assert.equal(address.toBase58(), mint.toBase58());
          assert.equal(commitment, "confirmed");
          return mintAccount({ token2022, decimals });
        },
      });
      assert.equal(await resolve(mint.toBase58()), decimals);
      assert.equal(await resolve(mint), decimals);
    }
  }
});

test("rejects wrong networks and malformed, non-mint, uninitialized or unsupported accounts", async () => {
  let accountReads = 0;
  const wrongNetwork = createMainnetMintPrecisionResolver({
    getGenesisHash: async () => "not-mainnet",
    getAccountInfo: async () => {
      accountReads++;
      return mintAccount();
    },
  });
  await assert.rejects(wrongNetwork(mint), /not Solana mainnet/);
  assert.equal(accountReads, 0);

  const wrongType = mintAccount({ token2022: true });
  wrongType.data[ACCOUNT_SIZE] = AccountType.Account;
  for (const account of [
    null,
    { ...mintAccount(), owner: SystemProgram.programId },
    { ...mintAccount(), executable: true },
    { ...mintAccount(), data: Buffer.alloc(MINT_SIZE - 1) },
    { ...mintAccount(), data: Buffer.alloc(ACCOUNT_SIZE) },
    wrongType,
    mintAccount({ initialized: false }),
    mintAccount({ decimals: 19 }),
  ]) {
    const resolve = createMainnetMintPrecisionResolver({
      getGenesisHash: async () => MAINNET,
      getAccountInfo: async () => account,
    });
    await assert.rejects(resolve(mint));
  }
});

test("coalesces concurrent reads and refreshes successful precision after its TTL", async () => {
  let time = 100,
    genesisReads = 0,
    mintReads = 0;
  const resolve = createMainnetMintPrecisionResolver(
    {
      getGenesisHash: async () => {
        genesisReads++;
        return MAINNET;
      },
      getAccountInfo: async () => {
        mintReads++;
        return mintAccount();
      },
    },
    { cacheTtlMs: 500, now: () => time },
  );
  assert.deepEqual(
    await Promise.all([resolve(mint), resolve(mint.toBase58()), resolve(mint)]),
    [8, 8, 8],
  );
  assert.equal(genesisReads, 1);
  assert.equal(mintReads, 1);
  time = 599;
  await resolve(mint);
  assert.equal(mintReads, 1);
  time = 600;
  await resolve(mint);
  assert.equal(genesisReads, 2);
  assert.equal(mintReads, 2);
});

test("retries failed genesis or mint reads without retaining a failed in-flight promise", async () => {
  let genesisReads = 0,
    mintReads = 0;
  const resolve = createMainnetMintPrecisionResolver({
    getGenesisHash: async () => {
      if (++genesisReads === 1) throw new Error("RPC unavailable");
      return MAINNET;
    },
    getAccountInfo: async () => {
      if (++mintReads === 1) throw new Error("RPC unavailable");
      return mintAccount();
    },
  });
  await assert.rejects(resolve(mint), /RPC unavailable/);
  await assert.rejects(resolve(mint), /RPC unavailable/);
  assert.equal(await resolve(mint), 8);
  assert.equal(genesisReads, 2);
  assert.equal(mintReads, 2);

  let current = mintAccount({ initialized: false });
  const afterInitialization = createMainnetMintPrecisionResolver({
    getGenesisHash: async () => MAINNET,
    getAccountInfo: async () => current,
  });
  await assert.rejects(afterInitialization(mint), /not been initialized/);
  current = mintAccount();
  assert.equal(await afterInitialization(mint), 8);
});

test("bounds successful mint caching and coalesces genesis verification across different mints", async () => {
  let genesisReads = 0,
    mintReads = 0;
  const resolve = createMainnetMintPrecisionResolver({
    getGenesisHash: async () => {
      genesisReads++;
      return MAINNET;
    },
    getAccountInfo: async () => {
      mintReads++;
      return mintAccount();
    },
  });
  const addresses = Array.from({ length: 2049 }, (_, index) => {
    const data = Buffer.alloc(32);
    data.writeUInt32LE(index);
    return new PublicKey(data);
  });
  await Promise.all(addresses.map(resolve));
  assert.equal(genesisReads, 1);
  assert.equal(mintReads, 2049);
  await resolve(addresses[2048]);
  assert.equal(mintReads, 2049);
  await resolve(addresses[0]);
  assert.equal(mintReads, 2050);
});
