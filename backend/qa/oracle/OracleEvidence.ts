import type { ProductQuote, RagEvidence } from '../../src/domain/types.ts';
import { normalizeEvidence } from '../../src/conversation/evidence/EvidenceNormalizer.ts';

export function oracleFacts(intent:string,quote:ProductQuote|null,rag:RagEvidence[]) {
  const facts=normalizeEvidence({intent,quote,rag});
  return {
    allowedFacts:facts.map(f=>`${f.key}=${f.value}`),
    sourceRefs:[...new Set(facts.map(f=>f.source))],
  };
}

export function defaultForbiddenFacts(intent:string):string[] {
  const t=String(intent).toUpperCase();
  const out=['RAW_STOCK_QUANTITY','UNVERIFIED_ACTION'];
  if(!['PRICE','PRICE_AVAILABILITY','QUOTE'].includes(t))out.push('UNSOLICITED_PRICE');
  return out;
}
