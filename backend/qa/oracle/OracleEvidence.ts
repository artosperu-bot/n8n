import type { ProductQuote, RagEvidence } from '../../src/domain/types.ts';
import { normalizeEvidence } from '../../src/conversation/evidence/EvidenceNormalizer.ts';

function ragKey(row:RagEvidence):string {
  const section=String(row.section??(row.domain==='INSTITUTIONAL'?'INSTITUCIONAL':'RAG')).trim().toUpperCase();
  return section||'RAG';
}

export function oracleFacts(intent:string,quote:ProductQuote|null,rag:RagEvidence[]) {
  const compact=normalizeEvidence({intent,quote,rag:[]});
  const allowedFacts=[
    ...compact.map(f=>`${f.key}=${f.value}`),
    ...rag.map(row=>`${ragKey(row)}=${String(row.text??'').trim()}`).filter(x=>!x.endsWith('=')),
  ];
  return {
    allowedFacts:[...new Set(allowedFacts)],
    sourceRefs:[...new Set([...compact.map(f=>f.source),...rag.map(r=>r.source).filter(Boolean)])],
  };
}

export function defaultForbiddenFacts(intent:string):string[] {
  const t=String(intent).toUpperCase();
  const out=['RAW_STOCK_QUANTITY','UNVERIFIED_ACTION'];
  if(!['PRICE','PRICE_AVAILABILITY','QUOTE'].includes(t))out.push('UNSOLICITED_PRICE');
  return out;
}
