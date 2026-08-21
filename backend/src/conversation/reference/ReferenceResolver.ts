import { fold } from '../../shared/text.ts';

export type ReferenceState={activeProduct?:string|null;recommendedProduct?:string|null;comparisonProducts?:string[]};
export type ReferenceResolution={queryTarget:string|null;explicitSwitch:boolean;nextActiveProduct:string|null;reason:string;mentionedProducts:string[];unknownNamedProduct:boolean};
const PRODUCTS=['Armor 25T Pro','Armor X12 Pro','Armor X13','Armor 22'];
export function canonicalProductName(value:string|null|undefined):string|null{if(!value)return null;const t=fold(value);return PRODUCTS.find(p=>t.includes(fold(p)))??null;}
function namedProducts(message:string):string[]{const t=fold(message);return PRODUCTS.filter(p=>t.includes(fold(p)));}
function comparisonAlternative(state:ReferenceState):string|null{const pair=state.comparisonProducts??[];if(pair.length<2)return null;const active=state.activeProduct??null;return pair.find(p=>p!==active)??pair[1]??null;}

export function resolveReference(message:string,state:ReferenceState):ReferenceResolution{
  const t=fold(message);const mentionedProducts=namedProducts(message);const named=mentionedProducts[0]??null;
  const recommendedRef=/\b(el\s+)?recomendad[oa]\b|\bel\s+que\s+me\s+recomendaste\b/.test(t);
  const selectionRef=/\b(me\s+quedo\s+con\s+ese|quiero\s+ese|elijo\s+ese)\b/.test(t);
  const otherRef=/\bel\s+otro\b/.test(t);
  const recommended=canonicalProductName(state.recommendedProduct)??state.recommendedProduct??null;
  const referentialTarget=selectionRef?recommended??state.activeProduct??null:recommendedRef?recommended:otherRef?comparisonAlternative(state):null;
  const product=named??referentialTarget;
  const attributePreference=/\bprefiero\s+(?:la|el)\s+[a-z0-9 ]+\s+del?\s+armor\b/.test(t);
  const namedSwitch=Boolean(named)&&!attributePreference&&/\b(prefiero|elijo|quiero\s+el|me\s+quedo\s+con\s+el)\b/.test(t);
  const selectionSwitch=Boolean(selectionRef&&product&&product!==(state.activeProduct??null));
  const explicitSwitch=namedSwitch||selectionSwitch;
  const queryTarget=product??state.activeProduct??recommended??null;
  let nextActiveProduct=explicitSwitch?queryTarget:(state.activeProduct??null);if(!nextActiveProduct&&mentionedProducts.length)nextActiveProduct=mentionedProducts[0];
  const armorMention=/\barmor\s+[a-z0-9][a-z0-9 ]{0,20}\b/.test(t);const unknownNamedProduct=armorMention&&mentionedProducts.length===0;
  let reason='ACTIVE_PRODUCT_FALLBACK';if(named)reason=namedSwitch?'EXPLICIT_PRODUCT_SWITCH':mentionedProducts.length>1?'MULTI_PRODUCT_MENTION':'NAMED_QUERY_TARGET';else if(selectionRef)reason='SELECTION_REFERENT';else if(recommendedRef)reason='RECOMMENDED_REFERENT';else if(otherRef)reason='COMPARISON_ALTERNATIVE';else if(!state.activeProduct&&recommended)reason='RECOMMENDED_FALLBACK';else if(unknownNamedProduct)reason='UNKNOWN_PRODUCT_MENTION';
  return{queryTarget,explicitSwitch,nextActiveProduct,reason,mentionedProducts,unknownNamedProduct};
}
