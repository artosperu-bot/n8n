import { createStechApp } from './app.ts';
import { installTraceConsoleSink } from './shared/trace.ts';

installTraceConsoleSink();

const app=createStechApp();
await app.listen(app.runtime.config.port,app.runtime.config.host);
console.log(`STECH backend listening on http://${app.runtime.config.host}:${app.runtime.config.port}`);
console.log(`Modes: LLM=${app.runtime.config.llmMode} ERP=${app.runtime.config.erpMode} Persistence=${app.runtime.config.persistenceMode} RAG=${app.runtime.config.ragMode} n8n=${app.runtime.config.automationMode}`);
