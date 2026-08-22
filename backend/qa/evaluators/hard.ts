import type { QaFinding, QaTurn, QaTurnObservation } from '../types.ts';

function hasOwn(obj: object, key: string): boolean { return Object.prototype.hasOwnProperty.call(obj, key); }
function normalizeNumericText(text: string): string { return text.replace(/(?<=\d)[,.](?=\d{3}(?:\D|$))/g, ''); }
function containsNumber(text: string, value: number): boolean { return normalizeNumericText(text).includes(String(value)); }

export function evaluateHard(turn: QaTurn, observation: QaTurnObservation): QaFinding[] {
  const findings: QaFinding[] = [];
  const response = observation.response ?? {};
  const state = response.state ?? {};
  const debug = response.debug ?? {};
  const expected = turn.expected ?? {};
  const answer = String(response.answer ?? '');

  if (!observation.ok || observation.httpStatus < 200 || observation.httpStatus >= 300 || response.error) {
    findings.push({ level: 'RED', code: 'HTTP_ERROR', message: `HTTP ${observation.httpStatus}: ${response.error ?? 'respuesta no exitosa'}` });
    return findings;
  }

  const checks: Array<[string, string, any, any]> = [
    ['intent','INTENT_MISMATCH',debug.intent,expected.intent],
    ['queryTarget','QUERY_TARGET_MISMATCH',debug.queryTarget ?? state.queryTarget ?? null,expected.queryTarget],
    ['activeProduct','ACTIVE_PRODUCT_MISMATCH',state.activeProduct ?? null,expected.activeProduct],
    ['recommendedProduct','RECOMMENDED_PRODUCT_MISMATCH',state.recommendedProduct ?? null,expected.recommendedProduct],
    ['explicitSwitch','SWITCH_MISMATCH',Boolean(debug.explicitSwitch ?? state.explicitSwitch),expected.explicitSwitch],
    ['budget','BUDGET_MISMATCH',state.budget ?? null,expected.budget],
  ];
  for (const [field,code,actual,wanted] of checks) if (hasOwn(expected,field) && actual !== wanted) findings.push({level:'RED',code,message:`${field}: esperado=${String(wanted)} actual=${String(actual)}`});

  for (const phrase of expected.answerIncludes ?? []) if (!answer.toLocaleLowerCase('es').includes(phrase.toLocaleLowerCase('es'))) findings.push({level:'RED',code:'ANSWER_REQUIRED_EVIDENCE_MISSING',message:`Falta en respuesta: ${phrase}`});
  for (const phrase of expected.answerExcludes ?? []) if (answer.toLocaleLowerCase('es').includes(phrase.toLocaleLowerCase('es'))) findings.push({level:'RED',code:'ANSWER_FORBIDDEN_CONTENT',message:`Contenido prohibido presente: ${phrase}`});

  const erp = debug.erp ?? null;
  if (debug.intent === 'PRICE') {
    if (erp?.price != null && !containsNumber(answer, Number(erp.price))) findings.push({level:'RED',code:'PRICE_EVIDENCE_MISMATCH',message:`La respuesta no contiene el precio ERP ${erp.price}.`});
    if (!erp && /S\/\s*[\d.,]+/i.test(answer)) findings.push({level:'RED',code:'UNSUPPORTED_NUMERIC_CLAIM',message:'Afirmó un precio numérico sin evidencia ERP.'});
  }

  if (debug.intent === 'STOCK') {
    if (/\b\d+\s*(?:unidad|unidades)\b|\bstock\s*[:=]?\s*\d+/i.test(answer)) findings.push({level:'RED',code:'STOCK_COUNT_LEAK',message:'Expuso cantidad numérica de inventario; solo debe indicar disponibilidad.'});
    if (erp?.stock != null && !/disponible/i.test(answer)) findings.push({level:'RED',code:'STOCK_AVAILABILITY_MISSING',message:'No expresó la disponibilidad de forma simple.'});
  }

  const verifiedInstitutionalAmount=debug.route==='RAG_INSTITUTIONAL'&&Array.isArray(debug.ragSources)&&debug.ragSources.length>0;
  if (!verifiedInstitutionalAmount&&!['PRICE','BUDGET_CONSTRAINT','HANDLE_PRICE_OBJECTION','QUOTE'].includes(String(debug.intent)) && /S\/\s*[\d.,]+/i.test(answer)) {
    findings.push({ level:'RED', code:'UNSOLICITED_PRICE', message:'Mencionó precio sin una solicitud explícita de precio/cotización.' });
  }

  if (debug.intent === 'IMAGE') {
    const lines = answer.split(/\r?\n/).map((x:string)=>x.trim()).filter(Boolean);
    if (!lines.length || lines.some((line:string)=>!/^https?:\/\/\S+$/i.test(line))) findings.push({level:'RED',code:'IMAGE_RESPONSE_NOT_URL_ONLY',message:'La respuesta de imágenes debe contener únicamente enlaces HTTP(S), uno por línea.'});
  }

  return findings;
}
