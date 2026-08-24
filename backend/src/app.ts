import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { execFileSync } from 'node:child_process';
import { buildRuntime } from './bootstrap.ts';

type EnvLike = Record<string,string|undefined>;
async function readJson(req: IncomingMessage): Promise<any> { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); if (!chunks.length) return {}; return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
function send(res: ServerResponse, status: number, body: unknown) { const data = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) }); res.end(data); }
function runtimeBuildId():string { try { return execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()||'unknown'; } catch { return process.env.STECH_BUILD_ID??'unknown'; } }

export function createStechApp(options: { env?: EnvLike } = {}) {
  const runtime = buildRuntime(options.env ?? process.env);
  const buildId=runtimeBuildId();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok', service: 'stech-backend', buildId, modes: { llm: runtime.config.llmMode, erp: runtime.config.erpMode, persistence: runtime.config.persistenceMode, n8n: runtime.config.automationMode, build:buildId } });
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const body = await readJson(req); const result = await runtime.engine.processTurn({ sessionId: String(body.sessionId ?? ''), message: String(body.message ?? ''), messageId: body.messageId ? String(body.messageId) : undefined }); return send(res, 200, result);
      }
      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch && req.method === 'GET') { const id = decodeURIComponent(sessionMatch[1]); return send(res, 200, { sessionId: id, state: await runtime.conversations.getState(id), messages: await runtime.conversations.getMessages(id) }); }
      if (sessionMatch && req.method === 'DELETE') { const id = decodeURIComponent(sessionMatch[1]); await runtime.conversations.reset(id); return send(res, 200, { ok: true, sessionId: id }); }
      return send(res, 404, { error: 'NOT_FOUND' });
    } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : String(error) }); }
  });
  return {
    listen(port: number, host: string) { return new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); }); },
    close() { return new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); },
    address: () => server.address(),
    runtime,
    server
  };
}
