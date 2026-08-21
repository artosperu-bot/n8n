export type AppConfig = {
  profile: 'real' | 'test';
  port: number;
  host: string;
  llmMode: 'fake' | 'openai';
  erpMode: 'fake' | 'sqlserver' | 'sql-bridge';
  persistenceMode: 'memory' | 'supabase';
  ragMode: 'fake' | 'disabled' | 'supabase';
  automationMode: 'noop' | 'n8n';
  openAiApiKey?: string;
  openAiModel: string;
  openAiEmbeddingModel: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  supabaseSessionTable: string;
  supabaseContextTable: string;
  supabaseConversationTable: string;
  supabaseTokenMetricsTable: string;
  supabaseRagRpc: string;
  sqlServerHost?: string;
  sqlServerPort: number;
  sqlServerDatabase?: string;
  sqlServerUser?: string;
  sqlServerPassword?: string;
  sqlServerEncrypt: boolean;
  sqlServerTrustServerCertificate: boolean;
  sqlCatalogProcedure: string;
  sqlBridgeUrl?: string;
  sqlBridgeToken?: string;
  sqlQuoteAction: string;
  sqlBudgetAction: string;
  n8nWebhookUrl?: string;
  n8nWebhookToken?: string;
  n8nStrict: boolean;
};

type EnvLike = Record<string, string | undefined>;

function bool(value: string | undefined, fallback = false): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function loadConfig(env: EnvLike = process.env): AppConfig {
  const profile: 'real' | 'test' = env.STECH_PROFILE === 'test' ? 'test' : 'real';
  const test = profile === 'test';
  return {
    profile,
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '127.0.0.1',
    llmMode: env.LLM_MODE === 'fake' ? 'fake' : env.LLM_MODE === 'openai' ? 'openai' : test ? 'fake' : 'openai',
    erpMode: env.ERP_MODE === 'fake' ? 'fake' : env.ERP_MODE === 'sql-bridge' ? 'sql-bridge' : env.ERP_MODE === 'sqlserver' ? 'sqlserver' : test ? 'fake' : 'sqlserver',
    persistenceMode: env.PERSISTENCE_MODE === 'supabase' ? 'supabase' : 'memory',
    ragMode: env.RAG_MODE === 'supabase' ? 'supabase' : env.RAG_MODE === 'fake' ? 'fake' : env.RAG_MODE === 'disabled' ? 'disabled' : test ? 'fake' : 'disabled',
    automationMode: env.N8N_MODE === 'n8n' ? 'n8n' : env.N8N_MODE === 'noop' ? 'noop' : test ? 'noop' : 'n8n',
    openAiApiKey: env.OPENAI_API_KEY,
    openAiModel: env.OPENAI_MODEL ?? 'REEMPLAZAR_MODELO_OPENAI',
    openAiEmbeddingModel: env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseSessionTable: env.SUPABASE_SESSION_TABLE ?? 'ia_sesiones',
    supabaseContextTable: env.SUPABASE_CONTEXT_TABLE ?? 'ia_contexto',
    supabaseConversationTable: env.SUPABASE_CONVERSATION_TABLE ?? 'ia_conversaciones',
    supabaseTokenMetricsTable: env.SUPABASE_TOKEN_METRICS_TABLE ?? 'ia_metricas_tokens',
    supabaseRagRpc: env.SUPABASE_RAG_RPC ?? 'match_documents',
    sqlServerHost: env.SQL_SERVER_HOST,
    sqlServerPort: Number(env.SQL_SERVER_PORT ?? 1433),
    sqlServerDatabase: env.SQL_SERVER_DATABASE,
    sqlServerUser: env.SQL_SERVER_USER,
    sqlServerPassword: env.SQL_SERVER_PASSWORD,
    sqlServerEncrypt: bool(env.SQL_SERVER_ENCRYPT, false),
    sqlServerTrustServerCertificate: bool(env.SQL_SERVER_TRUST_CERT, true),
    sqlCatalogProcedure: env.SQL_CATALOG_PROCEDURE ?? env.SQL_QUOTE_PROCEDURE ?? 'dbo.sp_BuscarProductosVenta',
    sqlBridgeUrl: env.SQL_BRIDGE_URL,
    sqlBridgeToken: env.SQL_BRIDGE_TOKEN,
    sqlQuoteAction: env.SQL_QUOTE_ACTION ?? 'product_quote',
    sqlBudgetAction: env.SQL_BUDGET_ACTION ?? 'products_within_budget',
    n8nWebhookUrl: env.N8N_WEBHOOK_URL,
    n8nWebhookToken: env.N8N_WEBHOOK_TOKEN,
    n8nStrict: bool(env.N8N_STRICT, false),
  };
}
