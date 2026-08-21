import type { LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { normalizeEvidence } from '../evidence/EvidenceNormalizer.ts';
import { fold } from '../../shared/text.ts';

export type WriterGuardResult = {
  answer: string;
  model: string;
  llmResult: LlmResult | null;
  fallback: { delivered: boolean; error?: string };
};

function familyModel(product:string):{prefix:string;model:string}|null {
  const parts=fold(product).split(/[^a-z0-9]+/).filter(Boolean);
  const modelIndex=parts.findIndex(x=>/\d/.test(x));
  if(modelIndex<=0)return null;
  return {prefix:parts.slice(0,modelIndex).join(' '),model:parts[modelIndex]};
}
function escapes(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function mentionsProductOutsideAllowlist(answer:string,allowed:string[]):boolean {
  if(!allowed.length)return false;
  const signatures=allowed.map(familyModel).filter((x):x is {prefix:string;model:string}=>Boolean(x));
  if(!signatures.length)return false;
  const byPrefix=new Map<string,Set<string>>();
  for(const row of signatures){
    const models=byPrefix.get(row.prefix)??new Set<string>();models.add(row.model);byPrefix.set(row.prefix,models);
  }
  const text=fold(answer);
  for(const [prefix,models] of byPrefix){
    const pattern=new RegExp(`\\b${escapes(prefix).replace(/\\ /g,'\\s+')}\\s+([a-z0-9-]*\\d[a-z0-9-]*)\\b`,'g');
    for(const match of text.matchAll(pattern))if(!models.has(match[1]))return true;
  }
  return false;
}

function guardGeneratedAnswer(input: LlmWriteInput, answer: string): string | null {
  const intent = String(input.intent ?? '').toUpperCase();
  const priceAllowed = ['PRICE','QUOTE','PRICE_AVAILABILITY'].includes(intent);
  if (!priceAllowed && /\bS\/\s*\d/i.test(answer)) return 'UNSOLICITED_PRICE';

  const unverifiedAction = /(?:ya\s+reserv(?:e|é)|reserva\s+(?:quedo|quedó|confirmada)|pedido\s+(?:creado|registrado)|compra\s+(?:realizada|confirmada))/i;
  if (unverifiedAction.test(answer)) return 'UNVERIFIED_ACTION';

  const stockLeak = /(?:stock|disponib)[^\n.]{0,35}\b\d+\s*(?:unidades?|uds?)\b|\b\d+\s*(?:unidades?|uds?)\b[^\n.]{0,35}(?:stock|disponib)/i;
  if (stockLeak.test(answer)) return 'RAW_STOCK_QUANTITY';

  const roboticMeta=/\b(?:cat[aá]logo\s+verificado|evidencia\s+verificada|seg[uú]n\s+(?:mi|el)\s+sistema(?:\s+interno)?|seg[uú]n\s+el\s+rag|querytarget|\bintent\b)\b/i;
  if(roboticMeta.test(answer))return 'ROBOTIC_META_LANGUAGE';

  if(String(input.decision?.nextBestAction??'').toUpperCase()==='ANSWER_ONLY'&&/[¿?]/.test(answer))return 'NBA_ANSWER_ONLY_QUESTION';
  if(mentionsProductOutsideAllowlist(answer,input.allowedProducts??[]))return 'PRODUCT_OUTSIDE_ALLOWLIST';

  const superlative=/\b(?:el|la)\s+m[aá]s\s+(?:resistente|potente|r[aá]pido|econ[oó]mico)|\b(?:la|el)\s+mejor\s+(?:opci[oó]n|bater[ií]a|c[aá]mara|rendimiento|resistencia)\b/i;
  if(superlative.test(answer)){
    const productIds=new Set((input.rag??[]).map(x=>String(x.productId??'').trim()).filter(Boolean));
    if(productIds.size<2)return 'UNSUPPORTED_SUPERLATIVE';
  }
  return null;
}

function stripTrailingQuestion(answer:string):string {
  const text=answer.trim();
  const inverted=text.indexOf('¿');
  if(inverted>0)return text.slice(0,inverted).trim();
  if(inverted===0)return '';
  const questionEnd=text.lastIndexOf('?');
  if(questionEnd<0)return text;
  const before=text.slice(0,questionEnd);
  const boundary=Math.max(before.lastIndexOf('.'),before.lastIndexOf('!'),before.lastIndexOf('\n'));
  return boundary>=0?before.slice(0,boundary+1).trim():'';
}

export async function safeWrite(llm: LlmProvider, input: LlmWriteInput, fallbackAnswer: string): Promise<WriterGuardResult> {
  try {
    const writeInput: LlmWriteInput = {
      ...input,
      verifiedFacts: input.verifiedFacts ?? normalizeEvidence({ intent:input.intent, quote:input.quote, rag:input.rag }),
    };
    const result = await llm.write(writeInput);
    const violation = guardGeneratedAnswer(input, result.text);
    if (violation === 'NBA_ANSWER_ONLY_QUESTION') {
      const salvaged=stripTrailingQuestion(result.text);
      if(salvaged && !guardGeneratedAnswer(input,salvaged)) {
        return { answer:salvaged, model:result.model, llmResult:result, fallback:{delivered:true} };
      }
    }
    if (violation) {
      return {
        answer: fallbackAnswer,
        model: result.model,
        llmResult: result,
        fallback: { delivered: false, error: violation },
      };
    }
    return { answer: result.text, model: result.model, llmResult: result, fallback: { delivered: true } };
  } catch (error) {
    return {
      answer: fallbackAnswer,
      model: 'deterministic-fallback-v0.4',
      llmResult: null,
      fallback: { delivered: false, error: error instanceof Error ? error.message : String(error) },
    };
  }
}
