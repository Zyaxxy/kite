import { NextResponse } from 'next/server';
import { getServerMarkets } from '@/lib/server/markets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await getServerMarkets();
    return NextResponse.json(snapshot, { status: snapshot.status === 'unavailable' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ assets: [], baskets: [], asOf: new Date().toISOString(), network: 'mainnet-beta', sources: [], status: 'unavailable', warnings: ['Market data is temporarily unavailable. Please try again.'] }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
