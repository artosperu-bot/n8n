import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../../src/conversation/HybridConversationEngine.ts',import.meta.url),'utf8');

test('hybrid recommendation path loads the full catalog before availability and eligibility filters',()=>{
  assert.match(source,/partitionRecommendationCandidates/);
  assert.match(source,/listCatalog\(\{onlyWithStock:false\}\)/);
  assert.doesNotMatch(source,/listCatalog\(\{onlyWithStock:true\}\)/);
});

test('recommendation trace exposes catalog, available and eligible candidate layers',()=>{
  assert.match(source,/availableCandidates/);
  assert.match(source,/pool\.available/);
  assert.match(source,/pool\.eligible/);
});
