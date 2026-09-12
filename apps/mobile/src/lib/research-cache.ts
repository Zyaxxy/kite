import { createResearchClient, type StockResearch } from "@kite/sdk";
import { apiGet } from "./config";

const researchClient = createResearchClient((mint, signal) =>
  apiGet<StockResearch>(
    `/api/research?mint=${encodeURIComponent(mint)}`,
    signal,
  ),
);

export const cachedResearch = researchClient.peek;
export const loadResearch = researchClient.load;
