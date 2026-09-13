"use client";

import { createResearchClient } from "@kite/sdk";
import { kiteClient } from "./api-client";

export const researchClient = createResearchClient((mint, signal) => kiteClient.getResearch(mint, signal));
