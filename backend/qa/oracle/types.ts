export type OracleDomain = 'SQL'|'PRODUCT_RAG'|'INSTITUTIONAL_RAG'|'MEMORY'|'HANDOFF';

export type OracleSpec = {
  intentClass?: string;
  domain: OracleDomain;
  product?: string | null;
  products?: string[];
  sections?: string[];
  institutionalTopic?: { category:string; subcategory?:string } | null;
  expectedReferenceBehavior?: string | null;
  expectedState?: Record<string,unknown>;
  expectedNba?: string | null;
  requiresHandoff?: boolean;
};

export type OracleExpectedProduct = { id:string | null; name:string };

export type OracleCard = {
  intentClass: string;
  authoritativeDomain: OracleDomain;
  expectedProductId: string | null;
  expectedProductName: string | null;
  expectedProducts: OracleExpectedProduct[];
  allowedFacts: string[];
  forbiddenFacts: string[];
  expectedReferenceBehavior: string | null;
  expectedStateDelta: Record<string,unknown>;
  expectedNbaClass: string | null;
  requiresHandoff: boolean;
  sourceRefs: string[];
};
