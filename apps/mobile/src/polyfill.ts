import { Buffer } from 'buffer';

// Run before the SDK: Solana's byte codecs depend on Buffer on Hermes and browsers.
const runtime = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (!runtime.Buffer) runtime.Buffer = Buffer;
