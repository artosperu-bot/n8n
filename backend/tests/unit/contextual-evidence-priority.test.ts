import test from 'node:test';
import assert from 'node:assert/strict';
import { productEvidenceSections } from '../../src/conversation/commercial/ProductEvidencePolicy.ts';

test('water dust pain outranks generic work evidence',()=>{
  const sections=productEvidenceSections({primary:'EVALUATE_USE'}, {useCase:'trabajo',problem:'su celular anterior se dañó por exposición a polvo y humedad',priorities:[]} as any);
  assert.equal(sections[0],'RESISTENCIA');
  assert.ok(sections.includes('RESISTENCIA'));
});

test('repeated repairs from drops select resistance evidence first',()=>{
  const sections=productEvidenceSections({primary:'EVALUATE_USE'}, {problem:'reparaciones_repetidas',priorities:[]} as any);
  assert.equal(sections[0],'RESISTENCIA');
});

test('battery pain selects battery evidence first',()=>{
  const sections=productEvidenceSections({primary:'EVALUATE_USE'}, {useCase:'trabajo',problem:'la batería no llega a la tarde y busca cargador',priorities:[]} as any);
  assert.equal(sections[0],'BATERIA');
});
