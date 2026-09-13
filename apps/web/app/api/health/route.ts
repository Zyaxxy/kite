import { NextResponse } from 'next/server';
export function GET() {
  return NextResponse.json({ service: 'kite-api', network: 'mainnet-beta', status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
