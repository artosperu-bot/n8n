import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvidence } from '../../src/conversation/evidence/EvidenceNormalizer.ts';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';

const row=(section:string,text:string)=>({domain:'PRODUCT',section,source:`TEST:${section}`,productId:'P-TEST',text}) as any;

test('accented Sí followed by punctuation becomes atomic product truth',()=>{
  const facts=normalizeEvidence({intent:'CAPABILITY',rag:[row('CONECTIVIDAD','- NFC: Sí.\n- Conectividad 5G: Sí.\n- Red 4G LTE: Sí.')]});
  assert.equal(facts.find(f=>f.key==='NFC')?.value,'Sí');
  assert.equal(facts.find(f=>f.key==='5G')?.value,'Sí');
  assert.equal(facts.find(f=>f.key==='4G_LTE')?.value,'Sí');
});

test('rugged certifications with Sí punctuation are preserved',()=>{
  const facts=normalizeEvidence({intent:'CAPABILITY',rag:[row('RESISTENCIA','- Certificación IP68: Sí.\n- Certificación IP69K: Sí.\n- MIL-STD-810H: Sí.\n- Resistencia a caídas: 1.5 m.')]});
  assert.equal(facts.find(f=>f.key==='IP68')?.value,'Sí');
  assert.equal(facts.find(f=>f.key==='IP69K')?.value,'Sí');
  assert.equal(facts.find(f=>f.key==='MIL_STD_810H')?.value,'Sí');
});

test('thermal boolean with accent survives normalization',()=>{
  const facts=normalizeEvidence({intent:'CAPABILITY',rag:[row('TERMICA','- Cámara térmica: Sí.')]});
  assert.equal(facts.find(f=>f.key==='CAMARA_TERMICA')?.value,'Sí');
});

test('raw NFC fallback also accepts Sí followed by period',()=>{
  const answer=buildGroundedDirectAnswer({message:'¿Tiene NFC?',intent:'CAPABILITY',attribute:'NFC',resolvedProduct:'Armor 22',verifiedFacts:[],rag:[row('CONECTIVIDAD','- NFC: Sí.\n- Bluetooth: Sí.')]} as any);
  assert.equal(answer,'Sí, Armor 22 tiene NFC.');
});
