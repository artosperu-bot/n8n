/*
STECH P3 prepared budget-routing guard.
Target: current implementation of `06 Resolver Turno y Estado`.
Status: STATICALLY TESTED ONLY — DO NOT CLAIM LIVE APPLIED.
Integration: inline/adapt these helpers after current-message normalization and before SPIN candidate acceptance / final intent arbitration.
Do not replace the whole live node from a historical export. Map to current fields after reading the current QA draft.
*/

'use strict';

const fold = v => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/\s+/g,' ').trim();

function parseMoney(raw){
  let s=String(raw ?? '').replace(/[^0-9.,]/g,'');
  if(!s) return null;
  if(s.includes(',') && s.includes('.')){
    const lastComma=s.lastIndexOf(','), lastDot=s.lastIndexOf('.');
    const dec=Math.max(lastComma,lastDot), frac=s.length-dec-1;
    if(frac===2){ const head=s.slice(0,dec).replace(/[.,]/g,''); return Number(head+'.'+s.slice(dec+1)); }
    return Number(s.replace(/[.,]/g,''));
  }
  const m=s.match(/^([0-9]{1,3})[,.]([0-9]{3})$/);
  if(m) return Number(m[1]+m[2]);
  if((s.match(/[,.]/g)||[]).length>1) return Number(s.replace(/[.,]/g,''));
  if(/[,.]/.test(s)){
    const [a,b]=s.split(/[,.]/);
    if(b?.length===3) return Number(a+b);
    if(b?.length===2) return Number(a+'.'+b);
  }
  const n=Number(s);
  return Number.isFinite(n)?n:null;
}

function detectBudget(message){
  const t=fold(message);
  const money='(?:s\\s*\\/\\s*)?([0-9][0-9.,]*)';
  const rangeRx=new RegExp('(?:entre|de)\\s*'+money+'\\s*(?:y|a|-)\\s*'+money,'i');
  const rm=t.match(rangeRx);
  if(rm){
    const a=parseMoney(rm[1]), b=parseMoney(rm[2]);
    if(a!=null&&b!=null) return {kind:'RANGE',min:Math.min(a,b),max:Math.max(a,b),source:'CURRENT_TURN'};
  }
  const capPatterns=[
    new RegExp('(?:presupuesto(?:\\s+maximo)?(?:\\s+(?:de|es))?|tengo\\s+maximo|mi\\s+maximo|tope(?:\\s+de)?|hasta|no\\s+mas\\s+de|puedo\\s+gastar(?:\\s+hasta)?|podria\\s+gastar(?:\\s+hasta)?|puedo\\s+pagar(?:\\s+hasta)?)\\s*'+money,'i'),
    new RegExp(money+'\\s*(?:es|seria|seria mi)?\\s*(?:mi\\s+)?(?:presupuesto|maximo|tope)','i')
  ];
  for(const rx of capPatterns){
    const m=t.match(rx); if(!m) continue;
    const nums=m.slice(1).map(parseMoney).filter(v=>v!=null);
    if(nums.length) return {kind:'CAP',min:null,max:nums[nums.length-1],source:'CURRENT_TURN'};
  }
  if(/\bpresupuesto\b/.test(t)){
    const m=t.match(new RegExp(money,'i'));
    if(m){ const n=parseMoney(m[1]); if(n!=null) return {kind:'CAP',min:null,max:n,source:'CURRENT_TURN'}; }
  }
  return null;
}

function detectPriceObjection(message){
  const t=fold(message);
  return /\b(esta|es|me parece)\s+(?:muy\s+)?car[oa]\b|\bcar[oa]\b|\bdemasiado(?:\s+car[oa])?\b|\b(?:se\s+)?sale\s+de\s+mi\s+presupuesto\b|\bfuera\s+de\s+mi\s+presupuesto\b|\bno\s+quiero\s+gastar\s+tanto\b|\bno\s+puedo\s+pagar\b|\bmas\s+de\s+lo\s+que\s+(?:quiero|puedo)\s+gastar\b|\blo\s+vi\s+mas\s+barato\b/.test(t);
}

function detectBudgetQuery(message){
  const t=fold(message);
  return /\b(?:cual|cuales|que)\b[^?.!]{0,50}\b(?:entra|entran|cabe|caben|queda|quedan)\b[^?.!]{0,30}\b(?:mi\s+)?presupuesto\b|\b(?:dentro|por debajo)\s+de\s+(?:mi\s+)?presupuesto\b/.test(t);
}

function stripBudgetClause(text){
  let t=fold(text);
  t=t.replace(/(?:y\s+)?(?:busco\s+algo\s+)?(?:entre|de)\s*(?:s\s*\/\s*)?[0-9][0-9.,]*\s*(?:y|a|-)\s*(?:s\s*\/\s*)?[0-9][0-9.,]*/g,' ');
  t=t.replace(/(?:y\s+)?(?:tengo\s+)?(?:un\s+)?presupuesto(?:\s+maximo)?(?:\s+(?:de|es))?\s*(?:s\s*\/\s*)?[0-9][0-9.,]*/g,' ');
  t=t.replace(/(?:y\s+)?(?:tengo\s+)?maximo\s*(?:de\s*)?(?:s\s*\/\s*)?[0-9][0-9.,]*/g,' ');
  t=t.replace(/(?:y\s+)?(?:podria|puedo)\s+(?:gastar|pagar)(?:\s+hasta)?\s*(?:s\s*\/\s*)?[0-9][0-9.,]*/g,' ');
  t=t.replace(/(?:y\s+)?(?:hasta|tope(?:\s+de)?|no\s+mas\s+de)\s*(?:s\s*\/\s*)?[0-9][0-9.,]*(?:\s+(?:estaria|seria)\s+bien)?/g,' ');
  return t.replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}

function hasMeaningfulResidual(text){
  const stop=new Set(['y','o','pero','con','sin','de','del','la','el','los','las','un','una','mi','me','para','por','algo','busco','tengo']);
  return stripBudgetClause(text).split(' ').some(tok=>tok.length>2&&!stop.has(tok)&&!/^[0-9]+$/.test(tok));
}

function classifyBudgetTurn(message,{prevBudget=null}={}){
  const budget=detectBudget(message);
  const budgetQuery=detectBudgetQuery(message);
  const priceObjection=detectPriceObjection(message);
  const effectiveBudget=budget || (prevBudget!=null?{kind:'CAP',min:null,max:Number(prevBudget),source:'MEMORY'}:null);
  return {
    budget,
    effectiveBudget,
    budgetConstraint:Boolean(budget),
    budgetQuery,
    priceObjection,
    preferredIntent: budgetQuery&&effectiveBudget ? 'RECOMMEND_WITHIN_BUDGET' : priceObjection ? 'HANDLE_PRICE_OBJECTION' : budget ? 'BUDGET_CONSTRAINT' : null,
    suppressBudgetOnlySpin:Boolean(budget),
  };
}

function sanitizeSpinCandidate(candidate, classification){
  const c={...(candidate||{})};
  if(!classification?.budgetConstraint) return {accepted:true,...c};
  const ev=String(c.evidencia||c.valor||'');
  if(!hasMeaningfulResidual(ev)) return {accepted:false,...c,motivo:'BUDGET_CONSTRAINT_NOT_SPIN'};
  const residual=stripBudgetClause(ev);
  return {accepted:true,...c,valor:residual,evidencia:residual,motivo:'BUDGET_CLAUSE_REMOVED_SPIN_PRESERVED'};
}

module.exports={classifyBudgetTurn,sanitizeSpinCandidate,detectBudget,detectPriceObjection,detectBudgetQuery,stripBudgetClause};
