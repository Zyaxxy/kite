'use client';

import React from 'react';

interface SentimentBadgeProps {
  score: number;
  label: string;
}

export function SentimentBadge({ score, label }: SentimentBadgeProps) {
  const tone =
    score > 0.1 ? 'text-up' : score < -0.1 ? 'text-down' : 'text-muted';

  return (
    <span className={`text-xs font-medium tabular-nums ${tone}`}>
      {label}
    </span>
  );
}
