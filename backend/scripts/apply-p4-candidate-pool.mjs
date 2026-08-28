import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=process.cwd();
const enginePath=resolve(root,'src/conversation/HybridConversationEngine.ts');
const typesPath=resolve(root,'src/domain/types.ts');

// Repository files may contain mixed CRLF/LF after edits from Windows and
// GitHub. Normalize before matching so this codemod validates code structure,
// not the editor-specific newline representation.
let engine=readFileSync(enginePath,'utf8').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
let types=readFileSync(typesPath,'utf8').replace(/\r\n/g,'\n').replace(/\r/g,'\n');

const importOld="import { rankRecommendations } from './recommendation/RecommendationPolicy.ts';";
const importNew="import { rankRecommendations } from './recommendation/RecommendationPolicy.ts';\nimport { partitionRecommendationCandidates } from './recommendation/CandidatePool.ts';";

const blockOld=`    let options:ProductQuote[]=[];
    try {
      options=this.#deps.erp.listCatalog
        ? await this.#deps.erp.listCatalog({onlyWithStock:true})
        : await this.#deps.erp.listProductsWithinBudget(maxBudget);
    } catch {
      try { options=await this.#deps.erp.listProductsWithinBudget(maxBudget); }
      catch { return {ranks:[],trace:{catalogCandidates:[],eligibleCandidates:[],discardedCandidates:[],sectionsRequested:[],sectionsRecovered:[],rankedCandidates:[],winner:null}}; }
    }
    const catalogCandidates=unique(options.map(productName));
    const discardedCandidates:RecommendationDecisionTrace['discardedCandidates']=[];
    const eligible:ProductQuote[]=[];
    for(const q of options){
      const name=productName(q)??q.product;
      if(q.price!=null&&q.price>maxBudget){discardedCandidates.push({product:name,reason:'BUDGET'});continue;}
      if(q.stock!=null&&q.stock<=0){discardedCandidates.push({product:name,reason:'NO_STOCK'});continue;}
      if(same(name,exclude)){discardedCandidates.push({product:name,reason:'EXCLUDED'});continue;}
      eligible.push(q);
    }`;

const blockNew=`    let options:ProductQuote[]=[];
    try {
      // Catalog existence is independent from current stock. Availability and
      // eligibility are derived only after the complete ERP catalog is loaded.
      options=this.#deps.erp.listCatalog
        ? await this.#deps.erp.listCatalog({onlyWithStock:false})
        : await this.#deps.erp.listProductsWithinBudget(maxBudget);
    } catch {
      try { options=await this.#deps.erp.listProductsWithinBudget(maxBudget); }
      catch { return {ranks:[],trace:{catalogCandidates:[],availableCandidates:[],eligibleCandidates:[],discardedCandidates:[],sectionsRequested:[],sectionsRecovered:[],rankedCandidates:[],winner:null}}; }
    }
    const pool=partitionRecommendationCandidates(options,{maxBudget,exclude});
    const catalogCandidates=unique(pool.catalog.map(productName));
    const availableCandidates=unique(pool.available.map(productName));
    const discardedCandidates:RecommendationDecisionTrace['discardedCandidates']=pool.discarded;
    const eligible:ProductQuote[]=pool.eligible;`;

const traceOld=`        catalogCandidates,
        eligibleCandidates:eligible.slice(0,20).map(q=>({product:productName(q)??q.product,productId:q.productRagId??null})),`;
const traceNew=`        catalogCandidates,
        availableCandidates,
        eligibleCandidates:eligible.slice(0,20).map(q=>({product:productName(q)??q.product,productId:q.productRagId??null})),`;

const typeOld=`  catalogCandidates:string[];\n  eligibleCandidates:RecommendationCandidateTrace[];`;
const typeNew=`  catalogCandidates:string[];\n  availableCandidates:string[];\n  eligibleCandidates:RecommendationCandidateTrace[];`;

function replaceExactly(source,oldText,newText,label){
  if(source.includes(newText))return source;
  const count=source.split(oldText).length-1;
  if(count!==1)throw new Error(`${label}: expected exactly one old boundary, found ${count}. No files were written.`);
  return source.replace(oldText,newText);
}

engine=replaceExactly(engine,importOld,importNew,'CandidatePool import');
engine=replaceExactly(engine,blockOld,blockNew,'rank candidate source/filter block');
engine=replaceExactly(engine,traceOld,traceNew,'recommendation trace layers');
types=replaceExactly(types,typeOld,typeNew,'RecommendationDecisionTrace availableCandidates');

writeFileSync(enginePath,engine,'utf8');
writeFileSync(typesPath,types,'utf8');
console.log('P4 CANDIDATE POOL WIRING APPLIED');
console.log('- ERP catalog request: onlyWithStock=false');
console.log('- trace: catalogCandidates + availableCandidates + eligibleCandidates + rankedCandidates');
console.log('- zero-stock products remain catalog members but cannot become eligible winners');
