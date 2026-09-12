import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, clusterApiUrl, SystemProgram, Transaction } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { DEVNET_MINTS } from '@kite/sdk';
import fs from 'fs';
import os from 'os';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { recipient } = await req.json();
    if (!recipient) {
      return NextResponse.json({ error: 'Recipient address required' }, { status: 400 });
    }

    const recipientPubkey = new PublicKey(recipient);
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    // Load mint authority keypair
    const keypairPath = path.join(os.homedir(), '.config/solana/id.json');
    if (!fs.existsSync(keypairPath)) {
      return NextResponse.json({ error: 'Deployer keypair not found' }, { status: 500 });
    }
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')));
    const authority = Keypair.fromSecretKey(secretKey);

    // 1. Gas check: If recipient has < 0.05 SOL, send them 0.1 SOL
    const balance = await connection.getBalance(recipientPubkey);
    if (balance < 0.05 * 1e9) {
      const gasTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: recipientPubkey,
          lamports: 0.1 * 1e9,
        })
      );
      await connection.sendTransaction(gasTx, [authority]);
    }

    // 2. Mint $1,000 Devnet USDC
    const usdcMint = new PublicKey(DEVNET_MINTS['USDC'].mint);
    const usdcAta = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      usdcMint,
      recipientPubkey
    );

    const usdcSig = await mintTo(
      connection,
      authority,
      usdcMint,
      usdcAta.address,
      authority.publicKey,
      BigInt(1000 * 1e6) // $1,000 USDC
    );

    // 3. Mint 5 xNVDA
    const nvdaMint = new PublicKey(DEVNET_MINTS['xNVDA'].mint);
    const nvdaAta = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      nvdaMint,
      recipientPubkey
    );

    await mintTo(
      connection,
      authority,
      nvdaMint,
      nvdaAta.address,
      authority.publicKey,
      BigInt(5 * 1e6) // 5 xNVDA
    );

    return NextResponse.json({
      success: true,
      signature: usdcSig,
      message: 'Successfully minted 1,000 USDC, 5 xNVDA, and transferred 0.1 SOL for gas!',
    });
  } catch (err: any) {
    console.error('Faucet error:', err);
    return NextResponse.json({ error: err.message || 'Faucet failed' }, { status: 500 });
  }
}
