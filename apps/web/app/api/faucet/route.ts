import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'The devnet faucet has been retired. Use paper trading to practise with virtual funds.' }, { status: 410 });
}
