import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';

test('semantic planner receives recent dialogue separately from canonical memory', async () => {
  let sent: any;
  const fetcher: typeof fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body ?? '{}'));
    return Response.json({
      model: 'gpt-5-mini-2025-08-07',
      output_text: JSON.stringify({
        primaryIntent:'PRICE', secondaryIntents:[], targetProduct:null, mentionedProducts:[], referenceType:'RECOMMENDED',
        explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[], customerNeed:null, customerProblem:null,
        priorities:[], objection:null, commercialStage:null, spinContribution:null, nextBestAction:'ADVANCE_IF_INTEREST',
        needsSql:false, needsProductRag:false, needsInstitutionalRag:false, confidence:0.95,
      }),
      usage:{input_tokens:50,output_tokens:20,total_tokens:70},
    });
  };
  const llm = new OpenAIProvider({ apiKey:'test', model:'gpt-5-mini-2025-08-07', fetcher });
  await llm.decide!({
    message:'¿y ese cuánto está?',
    state:{ recommendedProduct:'Armor 22', lastUserMessage:'¿qué me recomiendas?' },
    history:[
      { role:'user', content:'¿qué me recomiendas para construcción?' },
      { role:'assistant', content:'Por tu uso, empezaría por el Armor 22.' },
    ],
  } as any);

  assert.match(String(sent.input), /HISTORIA_RECIENTE/);
  assert.match(String(sent.input), /Por tu uso, empezaría por el Armor 22/);
  assert.match(String(sent.input), /MEMORIA_CANONICA/);
  assert.doesNotMatch(String(sent.instructions), /stored procedure|sp_Buscar|locks|context_version/i);
  assert.ok(String(sent.instructions).length < 1800, 'planner prompt should stay compact');
});
