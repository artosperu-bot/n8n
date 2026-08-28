import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../../src/conversation/HybridConversationEngine.ts',import.meta.url),'utf8');

function rankCandidatesSource():string{
  const start=source.indexOf('async #rankCandidates(');
  const end=source.indexOf('\n  async #recordUsage(',start);
  assert.ok(start>=0,'#rankCandidates boundary must exist');
  assert.ok(end>start,'#rankCandidates end boundary must exist');
  return source.slice(start,end);
}

test('hybrid recommendation path loads the full catalog before availability and eligibility filters',()=>{
  const rankSource=rankCandidatesSource();
  assert.match(rankSource,/partitionRecommendationCandidates/);
  assert.match(rankSource,/listCatalog\(\{onlyWithStock:false\}\)/);
  assert.doesNotMatch(rankSource,/listCatalog\(\{onlyWithStock:true\}\)/);
});

test('recommendation trace exposes catalog, available and eligible candidate layers',()=>{
  const rankSource=rankCandidatesSource();
  assert.match(rankSource,/availableCandidates/);
  assert.match(rankSource,/pool\.available/);
  assert.match(rankSource,/pool\.eligible/);
});
