import assert from 'node:assert/strict';
import test from 'node:test';
import { guardNightVisionClaim } from '../../src/conversation/commercial/FeatureEvidenceGuard.ts';

test('conventional camera specs cannot confirm night vision',()=>{
 const answer=guardNightVisionClaim({
  message:'tiene camara nocturna pa ver en la obra? jaja',
  answer:'Sí, tiene cámara principal de 13 MP.',
  product:'Armor X12 Pro',
  evidence:[{text:'Cámara principal: 13 MP. Video 1080p.',source:'QA',domain:'PRODUCT'}],
 });
 assert.match(answer,/no una función específica de visión nocturna/i);
 assert.doesNotMatch(answer,/^Sí/);
});
test('confirmed night vision fact preserves verified response',()=>{
 const original='Sí, Armor 22 incorpora cámara de visión nocturna de 64 MP.';
 const answer=guardNightVisionClaim({
  message:'tiene camara nocturna?',
  answer:original,
  product:'Armor 22',
  evidence:[{text:'- Cámara de visión nocturna: 64 MP. - Sensor cámara nocturna: OV64B.',source:'QA',domain:'PRODUCT'}],
 });
 assert.equal(answer,original);
});
test('unrelated camera question stays unchanged',()=>{
 assert.equal(guardNightVisionClaim({message:'cuantos megapixeles tiene?',answer:'Tiene 13 MP.',product:'Armor X12 Pro',evidence:[]}), 'Tiene 13 MP.');
});
