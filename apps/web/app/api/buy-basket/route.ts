import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { CURATED_BASKETS, MOCK_MARKET_INSIGHTS } from '@kite/sdk';
import fs from 'fs';
import os from 'os';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { recipient, basketId, usdcAmount } = await req.json();
    if (!recipient || !basketId || !usdcAmount) {
      return NextResponse.json(
        { error: 'recipient, basketId, and usdcAmount are required' },
        { status: 400 }
      );
    }

    const recipientPubkey = new PublicKey(recipient);
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    // Load authority keypair
    const keypairPath = path.join(os.homedir(), '.config/solana/id.json');
    if (!fs.existsSync(keypairPath)) {
      return NextResponse.json({ error: 'Authority keypair not found' }, { status: 500 });
    }
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')));
    const authority = Keypair.fromSecretKey(secretKey);

    // Find requested basket
    const basket = CURATED_BASKETS.find((b) => b.id === basketId);
    if (!basket) {
      return NextResponse.json({ error: `Basket ${basketId} not found` }, { status: 404 });
    }

    const mintedAssets: Array<{ symbol: string; amount: number; mint: string }> = [];
    let lastSignature = '';

    for (const asset of basket.assets) {
      const assetMint = new PublicKey(asset.mint);
      const weightFraction = asset.weight / 10000;
      const dollarsForAsset = Number(usdcAmount) * weightFraction;

      // Determine price from insights, fallback to 100
      const stockInfo = MOCK_MARKET_INSIGHTS[asset.symbol.replace(/^x/, '').replace(/^pre/, '')];
      const price = stockInfo?.price || 100;

      // Calculate quantity of stock tokens
      const units = dollarsForAsset / price;
      // Convert to 6 decimal integer
      const tokenAmountRaw = BigInt(Math.max(1, Math.round(units * 1e6)));

      const userAta = await getOrCreateAssociatedTokenAccount(
        connection,
        authority,
        assetMint,
        recipientPubkey
      );

      lastSignature = await mintTo(
        connection,
        authority,
        assetMint,
        userAta.address,
        authority.publicKey,
        tokenAmountRaw
      );

      mintedAssets.push({
        symbol: asset.symbol,
        amount: Number(tokenAmountRaw) / 1e6,
        mint: asset.mint,
      });
    }

    return NextResponse.json({
      success: true,
      signature: lastSignature,
      basketName: basket.name,
      basketTicker: basket.ticker,
      mintedAssets,
      message: `Successfully allocated $${usdcAmount} USDC across ${mintedAssets.length} basket assets on Devnet!`,
    });
  } catch (err: any) {
    console.error('Buy basket error:', err);
    return NextResponse.json({ error: err.message || 'Basket purchase failed' }, { status: 500 });
  }
}
