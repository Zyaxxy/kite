'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { KiteApp } from '../../../components/kite/KiteApp';

export default function StockSymbolPage() {
  const params = useParams();
  const rawSymbol = (params?.symbol as string) || 'xNVDA';
  const isBasket = rawSymbol.toLowerCase().startsWith('sol-') || rawSymbol === 'MAG7' || rawSymbol === 'AI-LEADERS' || rawSymbol === 'PRE-TECH';

  return <KiteApp initialSymbol={rawSymbol} initialIsBasket={isBasket} />;
}
