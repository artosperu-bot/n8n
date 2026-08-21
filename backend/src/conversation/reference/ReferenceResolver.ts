import { fold } from '../../shared/text.ts';

export type ReferenceState = {
  activeProduct?: string | null;
  salientProduct?: string | null;
  selectedProduct?: string | null;
  recommendedProduct?: string | null;
  comparisonProducts?: string[];
};

export type ReferenceOptions = {
  knownProducts?: string[];
  unknownNamedProduct?: boolean;
};

export type ReferenceResolution = {
  queryTarget: string | null;
  explicitSwitch: boolean;
  nextActiveProduct: string | null;
  selectedProduct: string | null;
  reason: string;
  mentionedProducts: string[];
  unknownNamedProduct: boolean;
};

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(v => String(v ?? '').trim()).filter(Boolean))];
}

export function canonicalProductName(value: string | null | undefined, knownProducts: string[] = []): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const t = fold(raw);
  return knownProducts.find(p => fold(p) === t || t.includes(fold(p)) || fold(p).includes(t)) ?? raw;
}

function productUniverse(state: ReferenceState, options: ReferenceOptions): string[] {
  return unique([
    ...(options.knownProducts ?? []),
    state.activeProduct,
    state.salientProduct,
    state.selectedProduct,
    state.recommendedProduct,
    ...(state.comparisonProducts ?? []),
  ]);
}

function aliasesForProduct(product:string):string[] {
  const parts=fold(product).split(/[^a-z0-9]+/).filter(Boolean);
  const firstModel=parts.findIndex(p=>/\d/.test(p));
  if(firstModel<0)return[];
  const tail=parts.slice(firstModel);
  const aliases=[tail[0],tail.join(' ')];
  return unique(aliases.filter(a=>a.length>=2));
}

function contextualAliasProducts(message:string,universe:string[]):string[] {
  const t=fold(message);
  if(/\b(dia|fecha|llega|llegue|entrega|entregar|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:el\s+)?\d{1,2}\b/.test(t))return[];
  const owners=new Map<string,string[]>();
  for(const product of universe){
    for(const alias of aliasesForProduct(product))owners.set(alias,[...(owners.get(alias)??[]),product]);
  }
  const matches:string[]=[];
  for(const [alias,products] of owners){
    if(products.length!==1)continue;
    const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(new RegExp(`\\b${escaped}\\b`,'i').test(t))matches.push(products[0]);
  }
  return unique(matches);
}

function directNamedProducts(message: string, universe: string[]): string[] {
  const t = fold(message);
  const direct=universe
    .filter(p => {
      const fp = fold(p);
      return fp.length >= 3 && t.includes(fp);
    })
    .sort((a, b) => fold(b).length - fold(a).length);
  return direct.length?direct:contextualAliasProducts(message,universe);
}

function comparisonAlternative(state: ReferenceState): string | null {
  const pair = unique(state.comparisonProducts ?? []);
  if (pair.length < 2) return null;
  const anchor = state.salientProduct ?? state.selectedProduct ?? state.activeProduct ?? null;
  if (anchor) {
    const alternate = pair.find(p => fold(p) !== fold(anchor));
    if (alternate) return alternate;
  }
  return pair[1] ?? null;
}

export function resolveReference(message: string, state: ReferenceState, options: ReferenceOptions = {}): ReferenceResolution {
  const t = fold(message);
  const universe = productUniverse(state, options);
  const directProducts = directNamedProducts(message, universe);
  const recommendedRef = /\b(el\s+)?recomendad[oa]\b|\bel\s+que\s+me\s+recomendaste\b/.test(t);
  const selectionRef = /\b(me\s+quedo\s+con\s+ese|quiero\s+ese|elijo\s+ese|me\s+quedo\s+con\s+el\s+que\s+me\s+recomendaste)\b/.test(t);
  const otherRef = /\bel\s+otro\b/.test(t);
  const recommended = canonicalProductName(state.recommendedProduct, universe);

  const mentionedProducts = unique([
    ...(recommendedRef && recommended ? [recommended] : []),
    ...directProducts,
  ]);
  const named = directProducts[0] ?? null;
  const unknownNamedProduct = Boolean(options.unknownNamedProduct);

  const recentSelection = state.selectedProduct ?? state.salientProduct ?? null;
  const referentialTarget = selectionRef
    ? recentSelection ?? recommended ?? state.activeProduct ?? null
    : recommendedRef
      ? recommended
      : otherRef
        ? comparisonAlternative(state)
        : null;

  const product = named ?? referentialTarget;
  const namedAliases=named?unique([fold(named),...aliasesForProduct(named)]):[];
  const namedSelection=Boolean(named)&&namedAliases.some(alias=>{
    const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp(`\\b(?:prefiero|elijo)\\s+(?:el\\s+)?${escaped}\\b|\\bquiero\\s+(?:el\\s+)?${escaped}\\b|\\bya\\s+(?:el\\s+)?${escaped}\\s+quiero\\b|\\bme\\s+quedo\\s+con\\s+(?:el\\s+)?${escaped}\\b`,'i').test(t);
  });
  const attributePreference = Boolean(named) && /\bprefiero\s+(?:la|el)\s+/.test(t) && !namedSelection;
  const namedSwitch = Boolean(namedSelection && !attributePreference && fold(named!) !== fold(state.activeProduct ?? ''));
  const selectionSwitch = Boolean(selectionRef && product && fold(product) !== fold(state.activeProduct ?? ''));
  const explicitSwitch = namedSwitch || selectionSwitch;

  const queryTarget = unknownNamedProduct ? null : (product ?? state.activeProduct ?? recommended ?? null);
  let nextActiveProduct = explicitSwitch ? queryTarget : (state.activeProduct ?? null);
  if (!nextActiveProduct && named) nextActiveProduct = named;

  const selectedProduct = namedSelection && named
    ? named
    : explicitSwitch && queryTarget
      ? queryTarget
      : selectionRef && queryTarget
        ? queryTarget
        : state.selectedProduct ?? null;

  let reason = 'ACTIVE_PRODUCT_FALLBACK';
  if (unknownNamedProduct) reason = 'UNKNOWN_PRODUCT_MENTION';
  else if (namedSelection) reason = explicitSwitch ? 'EXPLICIT_PRODUCT_SWITCH' : 'SELECTION_REFERENT';
  else if (named) reason = mentionedProducts.length > 1 ? 'MULTI_PRODUCT_MENTION' : 'NAMED_QUERY_TARGET';
  else if (selectionRef) reason = 'SELECTION_REFERENT';
  else if (recommendedRef) reason = 'RECOMMENDED_REFERENT';
  else if (otherRef) reason = 'COMPARISON_ALTERNATIVE';
  else if (!state.activeProduct && recommended) reason = 'RECOMMENDED_FALLBACK';

  return { queryTarget, explicitSwitch, nextActiveProduct, selectedProduct, reason, mentionedProducts, unknownNamedProduct };
}
