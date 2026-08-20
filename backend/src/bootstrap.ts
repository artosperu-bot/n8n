import { loadConfig, type AppConfig } from './config/config.ts';
import { MemoryConversationRepository } from './adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from './adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from './adapters/fake/FakeRagRepository.ts';
import { DisabledRagRepository } from './adapters/fake/DisabledRagRepository.ts';
import { FakeLlmProvider } from './adapters/fake/FakeLlmProvider.ts';
import { NoopAutomationBus } from './adapters/fake/NoopAutomationBus.ts';
import { N8nAutomationBus } from './adapters/n8n/N8nAutomationBus.ts';
import { SqlBridgeErpRepository } from './adapters/sqlbridge/SqlBridgeErpRepository.ts';
import { SqlServerErpRepository } from './adapters/sqlserver/SqlServerErpRepository.ts';
import { OpenAIProvider } from './adapters/openai/OpenAIProvider.ts';
import { SupabaseConversationRepository } from './adapters/supabase/SupabaseConversationRepository.ts';
import { SupabaseRagRepository } from './adapters/supabase/SupabaseRagRepository.ts';
import { ConversationEngine } from './conversation/ConversationEngine.ts';

function need(value: string | undefined, name: string): string {
  if (!value || value.startsWith('REEMPLAZAR')) throw new Error(`${name} is required for selected adapter`);
  return value;
}

export function buildRuntime(env: Record<string,string|undefined> = process.env) {
  const config: AppConfig = loadConfig(env);
  const conversations = config.persistenceMode === 'supabase'
    ? new SupabaseConversationRepository({ url: need(config.supabaseUrl,'SUPABASE_URL'), key: need(config.supabaseServiceRoleKey,'SUPABASE_SERVICE_ROLE_KEY'), stateTable: config.supabaseStateTable, sessionIdColumn: config.supabaseSessionIdColumn, stateColumn: config.supabaseStateColumn })
    : new MemoryConversationRepository();

  const erp = config.erpMode === 'sqlserver'
    ? new SqlServerErpRepository({
        server: need(config.sqlServerHost, 'SQL_SERVER_HOST'),
        port: config.sqlServerPort,
        database: need(config.sqlServerDatabase, 'SQL_SERVER_DATABASE'),
        user: need(config.sqlServerUser, 'SQL_SERVER_USER'),
        password: need(config.sqlServerPassword, 'SQL_SERVER_PASSWORD'),
        encrypt: config.sqlServerEncrypt,
        trustServerCertificate: config.sqlServerTrustServerCertificate,
        catalogProcedure: config.sqlCatalogProcedure,
      })
    : config.erpMode === 'sql-bridge'
      ? new SqlBridgeErpRepository({
          url: need(config.sqlBridgeUrl,'SQL_BRIDGE_URL'),
          token: config.sqlBridgeToken,
          catalogProcedure: config.sqlCatalogProcedure,
        })
      : new FakeErpRepository();

  const rag = config.ragMode === 'supabase'
    ? new SupabaseRagRepository({ url: need(config.supabaseUrl,'SUPABASE_URL'), key: need(config.supabaseServiceRoleKey,'SUPABASE_SERVICE_ROLE_KEY'), rpc: config.supabaseRagRpc })
    : config.ragMode === 'fake' ? new FakeRagRepository() : new DisabledRagRepository();

  const llm = config.llmMode === 'openai'
    ? new OpenAIProvider({ apiKey: need(config.openAiApiKey,'OPENAI_API_KEY'), model: need(config.openAiModel,'OPENAI_MODEL') })
    : new FakeLlmProvider();

  const automation = config.automationMode === 'n8n'
    ? new N8nAutomationBus({ url: need(config.n8nWebhookUrl,'N8N_WEBHOOK_URL'), token: config.n8nWebhookToken, strict: config.n8nStrict })
    : new NoopAutomationBus();

  return { config, conversations, erp, rag, llm, automation, engine: new ConversationEngine({ conversations, erp, rag, llm, automation }) };
}
