import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { FakeLlmProvider } from '../../src/adapters/fake/FakeLlmProvider.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';
import type { ErpRepository } from '../../src/ports/ErpRepository.ts';
import type { LlmDecisionInput, LlmProvider, LlmWriteInput } from '../../src/ports/LlmProvider.ts';

function failingErp(): ErpRepository {
  const fail = async () => { throw new Error('SQL bridge HTTP 500: TEST_BRIDGE_DOWN'); };
  return {
    getProductQuote: fail,
    searchProducts: fail,
    listProductsWithinBudget: fail,
    listCatalog: fail,
  } as ErpRepository;
}

test('ERP outage is not misclassified as an unknown named product', async () => {
  const base = new FakeLlmProvider();
  const llm: LlmProvider = {
    async decide(_input: LlmDecisionInput) {
      return {
        decision: {
          primaryIntent:'PRICE', secondaryIntents:[], targetProduct:'Armor X13', mentionedProducts:['Armor X13'],
          referenceType:'NAMED_QUERY_TARGET', explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[],
          customerNeed:null, customerProblem:null, priorities:[], objection:null, commercialStage:'CONSIDERACION', spinContribution:null,
          nextBestAction:'ANSWER_ONLY', needsSql:true, needsProductRag:false, needsInstitutionalRag:false, confidence:0.99,
        },
        model:'gpt-test', usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0}, durationMs:1,
      };
    },
    write(input: LlmWriteInput) { return base.write(input); },
  };

  const engine = new HybridConversationEngine({
    conversations:new MemoryConversationRepository(),
    telemetry:new NoopTelemetryRepository(),
    erp:failingErp(),
    rag:new FakeRagRepository(),
    llm,
    automation:new NoopAutomationBus(),
  });

  const result:any = await engine.processTurn({sessionId:'s-erp-down',message:'¿Cuánto cuesta el Armor X13?'});

  assert.equal(result.state.queryTarget,'Armor X13');
  assert.equal(result.debug.requestedUnknown,false,'an ERP exception must not mean the product is unknown');
  assert.equal(result.debug.route,'ERP_UNAVAILABLE');
  assert.notEqual(result.debug.nextBestAction,'ASK_MISSING_FACT');
  assert.match(String(result.debug.erpError??''),/TEST_BRIDGE_DOWN/);
  assert.match(result.answer,/no puedo confirmar|no puedo consultar|temporalmente/i);
  assert.doesNotMatch(result.answer,/uso principal|presupuesto máximo|ese modelo no figura/i);
});
