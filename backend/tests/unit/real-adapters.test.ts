import test from 'node:test';
import assert from 'node:assert/strict';
import { SqlBridgeErpRepository } from '../../src/adapters/sqlbridge/SqlBridgeErpRepository.ts';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';

test('SQL bridge adapter sends canonical EXEC query and maps authoritative quote', async () => {
  let body: any;
  let auth: string | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    auth = (init?.headers as Record<string, string> | undefined)?.authorization;
    return Response.json({
      ok: true,
      statusCode: 200,
      rows: [{ product: 'Armor 22', productCode: 'P000049', price: 1299, stock: 7, currency: 'PEN' }],
      error: null,
    });
  };

  const erp = new SqlBridgeErpRepository({
    url: 'https://sql.test/query',
    token: 'secret',
    catalogProcedure: 'dbo.sp_BuscarProductosVenta',
    fetcher,
  });

  const q = await erp.getProductQuote('Armor 22');
  assert.match(body.query, /^EXEC dbo\.sp_BuscarProductosVenta /);
  assert.match(body.query, /@TextoBusqueda=N'Armor 22'/);
  assert.equal(auth, 'Bearer secret');
  assert.equal(q?.source, 'SQL_BRIDGE');
  assert.equal(q?.price, 1299);
});

test('OpenAI adapter sends deterministic evidence through Responses API', async () => {
  let body: any;
  const fetcher: typeof fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({
      model: 'gpt-test',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Respuesta final' }] }],
    });
  };
  const llm = new OpenAIProvider({ apiKey: 'key', model: 'gpt-5-mini', fetcher });
  const result = await llm.write({
    message: 'precio?',
    intent: 'PRICE',
    state: { queryTarget: 'Armor 22' },
    deterministicAnswer: 'Armor 22: S/ 1299.',
    decision: {
      primaryIntent:'PRICE', secondaryIntents:[], targetProduct:'Armor 22', mentionedProducts:[], referenceType:'ACTIVE_PRODUCT_FALLBACK',
      explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[], customerNeed:null, customerProblem:null,
      priorities:[], objection:null, commercialStage:'CONSIDERACION', spinContribution:null, nextBestAction:'ANSWER_ONLY',
      needsSql:true, needsProductRag:false, needsInstitutionalRag:false, confidence:0.99,
    },
  });
  assert.equal(result.text, 'Respuesta final');
  assert.match(body.input, /S\/ 1299/);
  assert.match(body.instructions, /no inventes/i);
  assert.match(body.instructions, /persona experta, cercana y concreta/i);
  assert.match(body.instructions, /1 a 3 frases/i);
  assert.match(body.instructions, /150 a 450 caracteres/i);
  assert.match(body.instructions, /350 a 750 caracteres/i);
  assert.deepEqual(body.text, { verbosity: 'low' });
  assert.match(body.instructions, /ANSWER_ONLY/i);
  assert.match(body.instructions, /responder y terminar/i);
  assert.match(body.instructions, /ASSISTED_HANDOFF/i);
  assert.match(body.instructions, /nunca inventes acciones completadas/i);
});
