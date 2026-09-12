'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { GrowwApp } from '../../../components/groww/GrowwApp';

export default function StockSymbolPage() {
  const params = useParams();
  const symbol = (params?.symbol as string) || 'NVDA';

  return <GrowwApp initialCategory="stocks" initialSymbol={symbol} />;
}
