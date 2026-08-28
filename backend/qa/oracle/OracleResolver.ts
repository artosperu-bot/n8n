import type { ConversationState, ProductQuote, RagEvidence } from '../../src/domain/types.ts';
import type { ErpRepository } from '../../src/ports/ErpRepository.ts';
import type { RagRepository } from '../../src/ports/RagRepository.ts';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';
import { productEvidenceSections } from '../../src/conversation/commercial/ProductEvidencePolicy.ts';
import { oracleFacts, defaultForbiddenFacts } from './OracleEvidence.ts';
import type { OracleCard, OracleSpec } from './types.ts';

function normalizeIntent(value:string):string {
  if(value==='PRICE_AVAILABILITY')return'PRICE';
  if(value==='IMAGES')return'IMAGE';
  if(value==='ATTRIBUTE')return'CAPABILITY';
  if(value==='OBJECTION')return'HANDLE_PRICE_OBJECTION';
  return value;
}
function name(q:ProductQuote|null):string|null{return q?String(q.shortName??q.product).trim()||null:null;}

export class OracleResolver {
  readonly #erp:ErpRepository;
  readonly #rag:RagRepository;
  constructor(deps:{erp:ErpRepository;rag:RagRepository}){this.#erp=deps.erp;this.#rag=deps.rag;}

  async resolve(input:{message:string;spec:OracleSpec;state?:ConversationState}):Promise<OracleCard>{
    const intent=normalizeIntent(input.spec.intentClass??resolveIntentPlan(input.message).primary);
    const domain=input.spec.domain;
    let quote:ProductQuote|null=null;
    let rag:RagEvidence[]=[];
    const product=input.spec.product??null;
    const comparisonProducts=[...new Set((input.spec.products??[]).map(x=>x.trim()).filter(Boolean))];
    const comparisonQuotes:ProductQuote[]=[];
    const evidenceSections=intent==='COMPARE'
      ?[...new Set([...(input.spec.sections??[]),...productEvidenceSections({primary:'PRODUCT_INFO'},input.state??{}),'FISICO'])]
      :(input.spec.sections??[]);

    if(comparisonProducts.length&&['SQL','PRODUCT_RAG'].includes(domain)){
      for(const candidate of comparisonProducts){
        const resolved=await this.#erp.getProductQuote(candidate).catch(()=>null);
        if(resolved)comparisonQuotes.push(resolved);
      }
    }

    if(product&&['SQL','PRODUCT_RAG'].includes(domain)){
      quote=await this.#erp.getProductQuote(product).catch(()=>null);
    }

    if(domain==='PRODUCT_RAG'&&comparisonQuotes.length){
      for(const candidate of comparisonQuotes){
        if(!candidate.productRagId)continue;
        const evidence=this.#rag.searchProduct
          ?await this.#rag.searchProduct(input.message,candidate.productRagId,evidenceSections,8).catch(()=>[])
          :await this.#rag.search(input.message,name(candidate)).catch(()=>[]);
        rag.push(...evidence);
      }
    }else if(domain==='PRODUCT_RAG'&&quote?.productRagId){
      rag=this.#rag.searchProduct
        ?await this.#rag.searchProduct(input.message,quote.productRagId,evidenceSections,8).catch(()=>[])
        :await this.#rag.search(input.message,name(quote)).catch(()=>[]);
    }else if(domain==='INSTITUTIONAL_RAG'){
      rag=this.#rag.searchInstitutional
        ?await this.#rag.searchInstitutional(input.message,4).catch(()=>[])
        :await this.#rag.search(input.message,null).catch(()=>[]);
    }

    let allowedFacts:string[]=[];
    let sourceRefs:string[]=[];
    if(domain==='SQL'&&intent==='IMAGE'&&product&&this.#erp.getProductImages){
      const images=await this.#erp.getProductImages(product,10).catch(()=>[]);
      allowedFacts=images.map(x=>`IMAGE_URL=${x.url}`);
      sourceRefs=[...new Set(images.map(x=>x.source))];
    }else if(['SQL','PRODUCT_RAG','INSTITUTIONAL_RAG'].includes(domain)){
      if(comparisonQuotes.length){
        for(const candidate of comparisonQuotes){
          const evidence=oracleFacts(intent,candidate,rag.filter(x=>!x.productId||x.productId===candidate.productRagId));
          allowedFacts.push(...evidence.allowedFacts);
          sourceRefs.push(...evidence.sourceRefs);
        }
        allowedFacts=[...new Set(allowedFacts)];
        sourceRefs=[...new Set(sourceRefs)];
      }else{
        const evidence=oracleFacts(intent,quote,rag);
        allowedFacts=evidence.allowedFacts;
        sourceRefs=evidence.sourceRefs;
      }
    }

    return{
      intentClass:intent,
      authoritativeDomain:domain,
      expectedProductId:quote?.productRagId??null,
      expectedProductName:name(quote)??product??null,
      expectedProducts:comparisonProducts.map(candidate=>{
        const resolved=comparisonQuotes.find(x=>name(x)===candidate);
        return{id:resolved?.productRagId??null,name:name(resolved)??candidate};
      }),
      allowedFacts,
      forbiddenFacts:defaultForbiddenFacts(intent),
      expectedReferenceBehavior:input.spec.expectedReferenceBehavior??null,
      expectedStateDelta:input.spec.expectedState??{},
      expectedNbaClass:input.spec.expectedNba??null,
      requiresHandoff:input.spec.requiresHandoff??domain==='HANDOFF',
      sourceRefs,
    };
  }
}
