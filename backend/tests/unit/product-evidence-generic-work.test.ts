import test from 'node:test';
import assert from 'node:assert/strict';
import { productEvidenceSections } from '../../src/conversation/commercial/ProductEvidencePolicy.ts';

test('generic work use does not guess which technical feature matters',()=>{
  assert.deepEqual(productEvidenceSections({primary:'EVALUATE_USE'},{useCase:'trabajo'} as any),[]);
});

test('specific construction use still focuses rugged and battery evidence',()=>{
  const sections=productEvidenceSections({primary:'EVALUATE_USE'},{useCase:'trabajo_construccion'} as any);
  assert.ok(sections.includes('RESISTENCIA'));
  assert.ok(sections.includes('BATERIA'));
});

test('an explicit fall problem focuses resistance even with generic work use',()=>{
  const sections=productEvidenceSections({primary:'EVALUATE_USE'},{useCase:'trabajo',problem:'caidas_frecuentes'} as any);
  assert.deepEqual(sections,['RESISTENCIA']);
});
