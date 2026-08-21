import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntent } from '../../src/conversation/intent/IntentResolver.ts';

test('greeting does not hide a commercial need',()=>{assert.equal(resolveIntent('Hola, trabajo en construcción y necesito algo resistente',{}),'RECOMMEND');});
test('comparison conjugations are recognized',()=>{assert.equal(resolveIntent('Compáralos para trabajo',{}),'COMPARE');assert.equal(resolveIntent('¿Qué diferencia hay entre el Armor X13 y el Armor 22?',{}),'COMPARE');});
test('recommendation images and policy intents are explicit',()=>{assert.equal(resolveIntent('¿Cuál me recomiendas para trabajo?',{}),'RECOMMEND');assert.equal(resolveIntent('Mándame fotos del Armor X13',{}),'IMAGE');assert.equal(resolveIntent('¿Hacen envíos a provincia?',{}),'POLICY');assert.equal(resolveIntent('¿Hay otra opción más económica sin perder resistencia?',{}),'RECOMMEND');});
test('purchase and quote language is recognized',()=>{assert.equal(resolveIntent('Quiero avanzar con la compra',{}),'PURCHASE');assert.equal(resolveIntent('Necesito una cotización para 12 equipos',{}),'QUOTE');});
