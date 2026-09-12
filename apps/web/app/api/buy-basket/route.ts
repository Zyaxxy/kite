import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Devnet basket minting has been retired. Use paper baskets or approve mainnet swaps from your wallet.' }, { status: 410 });
}
