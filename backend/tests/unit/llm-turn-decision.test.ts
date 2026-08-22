import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';

test('GPT-5 mini returns a structured semantic/commercial turn decision', async () => {
  let sent: any;
  const fetcher: typeof fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body ?? '{}'));
    return Response.json({
      model: 'gpt-5-mini-2025-08-07',
      output_text: JSON.stringify({
        primaryIntent: 'PURCHASE',
        secondaryIntents: [],
        targetProduct: 'Armor 22',
        mentionedProducts: [],
        referenceType: 'SELECTION',
        explicitSwitch: false,
        selectedProduct: 'Armor 22',
        comparisonProducts: ['Armor X13', 'Armor 22'],
        attributes: [],
        customerNeed: 'trabajo en campo',
        customerProblem: null,
        priorities: ['resistencia'],
        objection: null,
        commercialStage: 'DECISION',
        spinContribution: null,
        nextBestAction: 'ASSISTED_HANDOFF',
        needsSql: true,
        needsProductRag: false,
        needsInstitutionalRag: false,
        confidence: 0.96
      }),
      usage: { input_tokens: 90, output_tokens: 40, total_tokens: 130 }
    });
  };
  const llm = new OpenAIProvider({ apiKey: 'test', model: 'gpt-5-mini-2025-08-07', fetcher });
  const result = await llm.decide!({
    message: 'Entonces me quedo con ese',
    state: {
      activeProduct: 'Armor 22',
      selectedProduct: 'Armor 22',
      recommendedProduct: 'Armor 25T Pro',
      salientProduct: 'Armor 22',
      comparisonProducts: ['Armor X13', 'Armor 22'],
      useCase: 'trabajo en campo',
      priorities: ['resistencia']
    }
  });

  assert.equal(result.decision.primaryIntent, 'PURCHASE');
  assert.equal(result.decision.targetProduct, 'Armor 22');
  assert.equal(result.decision.nextBestAction, 'ASSISTED_HANDOFF');
  assert.equal(result.decision.confidence, 0.96);
  assert.equal(result.usage.totalTokens, 130);
  assert.match(sent.instructions, /analista conversacional/i);
  assert.match(String(sent.input), /HISTORIA_RECIENTE/);
  assert.match(String(sent.input), /Armor 25T Pro/);
});

test('semantic extraction rejects a query purpose as customerNeed and SPIN use case',async()=>{
  const fetcher:typeof fetch=async()=>Response.json({
    model:'gpt-test',
    output_text:JSON.stringify({
      primaryIntent:'STOCK',secondaryIntents:[],targetProduct:'Armor 22',mentionedProducts:['Armor 22'],
      referenceType:'NAMED_QUERY_TARGET',explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],
      customerNeed:'stock_availability',customerProblem:null,priorities:[],objection:null,commercialStage:null,
      spinContribution:'uso:stock_availability',nextBestAction:'ANSWER_ONLY',confidence:0.9,
    }),
    usage:{input_tokens:1,output_tokens:1,total_tokens:2},
  });
  const llm=new OpenAIProvider({apiKey:'test',model:'gpt-test',fetcher});
  const result=await llm.decide!({message:'¿Tienen stock?',state:{}});
  assert.equal(result.decision.customerNeed,null);
  assert.equal(result.decision.spinContribution,null);
});
