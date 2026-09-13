import { createResearchClient } from '@kite/sdk';
import { kiteClient } from './config';

const researchClient = createResearchClient((mint, signal) => kiteClient.getResearch(mint, signal));
export const cachedResearch = researchClient.peek;
export const loadResearch = researchClient.load;
