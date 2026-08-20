import { createStechApp } from './app.ts';
const app=createStechApp();
await app.listen(app.runtime.config.port,app.runtime.config.host);
console.log(`STECH backend listening on http://${app.runtime.config.host}:${app.runtime.config.port}`);
console.log(`Modes: LLM=${app.runtime.config.llmMode} ERP=${app.runtime.config.erpMode} Persistence=${app.runtime.config.persistenceMode} n8n=${app.runtime.config.automationMode}`);
