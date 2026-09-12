"use client";

import { createResearchClient, type StockResearch } from "@kite/sdk";

export const researchClient = createResearchClient(async (mint, signal) => {
  const response = await fetch(
    `/api/research?mint=${encodeURIComponent(mint)}`,
    { signal, cache: "no-store" },
  );
  if (!response.ok)
    throw new Error(
      "Company research is temporarily unavailable. Please retry.",
    );
  return (await response.json()) as StockResearch;
});
