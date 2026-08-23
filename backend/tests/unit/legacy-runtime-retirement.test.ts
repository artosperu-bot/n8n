import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const bootstrap=readFileSync(new URL('../../src/bootstrap.ts',import.meta.url),'utf8');
const types=readFileSync(new URL('../../src/domain/types.ts',import.meta.url),'utf8');

test('runtime authority is HybridConversationEngine and legacy ConversationEngine is retired',()=>{
  assert.match(bootstrap,/from ['"]\.\/conversation\/HybridConversationEngine\.ts['"]/);
  assert.doesNotMatch(bootstrap,/from ['"]\.\/conversation\/ConversationEngine\.ts['"]/);
  assert.equal(existsSync(new URL('../../src/conversation/ConversationEngine.ts',import.meta.url)),false);
  assert.equal(existsSync(new URL('../integration/conversation-engine.test.ts',import.meta.url)),false);
});

test('domain state types do not depend on legacy IntentResolver',()=>{
  assert.doesNotMatch(types,/IntentResolver\.ts/);
  assert.doesNotMatch(types,/Intent\s*\|\s*string|string\s*\|\s*Intent/);
  assert.match(types,/lastIntent\?:\s*string\s*\|\s*null/);
});
