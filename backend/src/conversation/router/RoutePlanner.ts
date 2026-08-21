import type { IntentPlan, SemanticIntent } from '../intent/IntentPlan.ts';

export type SalesRoute =
  | 'DIRECT_RESPONSE' | 'SQL_PRODUCTS' | 'RAG_PRODUCT' | 'RAG_INSTITUTIONAL'
  | 'SQL_AND_RAG' | 'COMPARISON' | 'CLARIFICATION' | 'ASSISTED_HANDOFF';

export type RouteContext = { hasProduct?: boolean; hasOrderCredentials?: boolean };
export type RoutePlan = { route: SalesRoute; sqlTools: string[]; needsProductRag: boolean; needsInstitutionalRag: boolean; intents: SemanticIntent[] };

const SQL = {
  resolve: 'dbo.sp_ResolverContextoCatalogoVenta',
  products: 'dbo.sp_BuscarProductosVenta',
  categories: 'dbo.sp_ListarCategoriasVenta',
  subcategories: 'dbo.sp_ListarSubcategoriasVenta',
  catalog: 'dbo.sp_ListarCatalogoVenta',
  images: 'dbo.sp_BuscarImagenesProductoVenta',
  order: 'dbo.sp_ConsultarPedido',
} as const;

function uniq(values: string[]): string[] { return [...new Set(values)]; }

export function planRoute(intent: IntentPlan, context: RouteContext = {}): RoutePlan {
  const intents = [intent.primary, ...intent.secondary];

  if (intent.primary === 'PURCHASE' || intent.primary === 'HUMAN') {
    return { route: 'ASSISTED_HANDOFF', sqlTools: [], needsProductRag: false, needsInstitutionalRag: false, intents };
  }
  if (intent.primary === 'ORDER_STATUS') {
    return { route: context.hasOrderCredentials ? 'SQL_PRODUCTS' : 'CLARIFICATION', sqlTools: context.hasOrderCredentials ? [SQL.order] : [], needsProductRag: false, needsInstitutionalRag: false, intents };
  }
  if (intent.primary === 'CATEGORIES') return { route: 'SQL_PRODUCTS', sqlTools: [SQL.categories], needsProductRag: false, needsInstitutionalRag: false, intents };
  if (intent.primary === 'SUBCATEGORIES') return { route: 'SQL_PRODUCTS', sqlTools: [SQL.subcategories], needsProductRag: false, needsInstitutionalRag: false, intents };
  if (intent.primary === 'CATALOG') return { route: 'SQL_PRODUCTS', sqlTools: [SQL.catalog], needsProductRag: false, needsInstitutionalRag: false, intents };
  if (intent.primary === 'POLICY' || intent.primary === 'WARRANTY') return { route: 'RAG_INSTITUTIONAL', sqlTools: [], needsProductRag: false, needsInstitutionalRag: true, intents };

  if (intent.primary === 'PRODUCT_INFO' || intent.primary === 'ATTRIBUTE') {
    return { route: context.hasProduct ? 'RAG_PRODUCT' : 'CLARIFICATION', sqlTools: context.hasProduct ? [] : [SQL.resolve], needsProductRag: context.hasProduct, needsInstitutionalRag: false, intents };
  }
  if (intent.primary === 'IMAGES') {
    return { route: context.hasProduct ? 'SQL_PRODUCTS' : 'CLARIFICATION', sqlTools: context.hasProduct ? [SQL.images] : [], needsProductRag: false, needsInstitutionalRag: false, intents };
  }
  if (intent.primary === 'PRICE_AVAILABILITY' || intent.primary === 'STOCK') {
    if (!context.hasProduct) return { route: 'CLARIFICATION', sqlTools: [SQL.resolve], needsProductRag: false, needsInstitutionalRag: false, intents };
    const tools = [SQL.products];
    if (intents.includes('IMAGES')) tools.push(SQL.images);
    return { route: 'SQL_PRODUCTS', sqlTools: uniq(tools), needsProductRag: false, needsInstitutionalRag: intents.includes('POLICY'), intents };
  }
  if (intent.primary === 'COMPARE') return { route: context.hasProduct ? 'COMPARISON' : 'CLARIFICATION', sqlTools: [], needsProductRag: context.hasProduct, needsInstitutionalRag: false, intents };
  if (intent.primary === 'RECOMMEND') return { route: 'SQL_AND_RAG', sqlTools: [SQL.catalog], needsProductRag: true, needsInstitutionalRag: false, intents };
  if (intent.primary === 'EVALUATE_USE' || intent.primary === 'OBJECTION') return { route: context.hasProduct ? 'RAG_PRODUCT' : 'DIRECT_RESPONSE', sqlTools: [], needsProductRag: context.hasProduct, needsInstitutionalRag: false, intents };

  return { route: 'DIRECT_RESPONSE', sqlTools: [], needsProductRag: false, needsInstitutionalRag: false, intents };
}
