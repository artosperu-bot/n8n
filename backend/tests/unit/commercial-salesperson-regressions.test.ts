import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpinReadiness } from '../../src/conversation/nba/SpinProgression.ts';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';

test('explicit substantive priorities skip redundant situation discovery',()=>{
  const spin=evaluateSpinReadiness({priorities:['resistencia','bateria']});
  assert.equal(spin.readyForRecommendation,true);
  assert.equal(spin.nextMissingFact,null);
  assert.equal(spin.stage,'READY');
});

test('budget alone is not enough context for a recommendation',()=>{
  const spin=evaluateSpinReadiness({budget:800});
  assert.equal(spin.readyForRecommendation,false);
  assert.equal(spin.nextMissingFact,'uso principal');
});

test('price-only priority is not enough context for a recommendation',()=>{
  const spin=evaluateSpinReadiness({priorities:['precio'],budget:800});
  assert.equal(spin.readyForRecommendation,false);
  assert.equal(spin.nextMissingFact,'uso principal');
});

test('neutral OTHER does not invent commercial discovery',()=>{
  assert.equal(nextBestAction('OTHER',{}),'ANSWER_ONLY');
});

test('generic objection without a verified alternative answers without inventing a budget question',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'Se me hace muy grande.',
    intent:'OBJECTION',
    state:{activeProduct:'Armor 22',objection:'tamano'},
    decision:{nextBestAction:'OFFER_ALTERNATIVE'} as any,
    allowedProducts:['Armor 22'],
    alternatives:[],
  });
  assert.equal(prepared.nextBestAction,'ANSWER_ONLY');
  assert.equal(prepared.missingFact,null);
});

test('price objection without verified alternative asks budget only when budget is unknown',()=>{
  const unknown=prepareCommercialWriteInput({
    message:'Está caro.',
    intent:'HANDLE_PRICE_OBJECTION',
    state:{activeProduct:'Armor 22',objection:'precio'},
    decision:{nextBestAction:'OFFER_ALTERNATIVE'} as any,
    allowedProducts:['Armor 22'],
    alternatives:[],
  });
  assert.equal(unknown.nextBestAction,'ASK_MISSING_FACT');
  assert.equal(unknown.missingFact,'presupuesto máximo');

  const known=prepareCommercialWriteInput({
    message:'Está caro, mi tope es 900.',
    intent:'HANDLE_PRICE_OBJECTION',
    state:{activeProduct:'Armor 22',objection:'precio',budget:900},
    budget:900,
    decision:{nextBestAction:'OFFER_ALTERNATIVE'} as any,
    allowedProducts:['Armor 22'],
    alternatives:[],
  });
  assert.equal(known.nextBestAction,'ANSWER_ONLY');
  assert.equal(known.missingFact,null);
});
