import assert from 'node:assert/strict';
import test from 'node:test';
import { customerFacingOpening } from '../../src/conversation/commercial/CustomerFacingOpening.ts';

test('first informal customer receives brand greeting and one natural discovery question',()=>{
 const answer=customerFacingOpening({
   answer:'Aún no hay una opción que destaque con claridad.',
   customerMessage:'holaa q tal? busco celu q aguante golpes pa mi chamba',
   priorTurnCount:0,
 });
 assert.match(answer,/^¡Buenas! Somos S&T Store/);
 assert.match(answer,/celular resistente/);
 assert.match(answer,/obra, campo, taller o almacén/);
 assert.doesNotMatch(answer,/a[uú]n no hay una opci[oó]n/i);
});
test('preserve verified price and greet only on first turn',()=>{
 const reply='Armor 22 está a S/ 1399.';
 const first=customerFacingOpening({answer:reply,customerMessage:'ola kuanto vale el armor 22',priorTurnCount:0});
 assert.match(first,/^¡Buenas! Somos S&T Store/);
 assert.match(first,/S\/ 1399/);
 const second=customerFacingOpening({answer:reply,customerMessage:'me repites?',priorTurnCount:1});
 assert.equal(second,reply);
});
test('pure greetings do not repeat the brand or greet twice',()=>{
 const msg=customerFacingOpening({answer:'Hola, cuéntame qué equipo buscas.',customerMessage:'hola',priorTurnCount:0});
 assert.equal((msg.match(/Somos S&T Store/g)??[]).length,1);
 assert.doesNotMatch(msg, /Hola, cuéntame/i);
 assert.match(msg, /Cuéntame qué equipo buscas/);
});
test('first generic response is repaired without inventing prices or stock',()=>{
 const msg=customerFacingOpening({answer:'Podemos ayudarte:',customerMessage:'hola',priorTurnCount:0});
 assert.match(msg,/Cuéntame qué tipo de equipo/);
 assert.doesNotMatch(msg,/S\/|disponible|stock|\d+GB/);
});

test('does not duplicate hello when draft starts with Hola dash',()=>{
 const reply=customerFacingOpening({answer:'Hola — te interesa un celular resistente.',customerMessage:'hola',priorTurnCount:0});
 assert.match(reply,/^¡Buenas! Somos S&T Store/);
 assert.doesNotMatch(reply,/\nHola\b/i);
 assert.match(reply,/Te interesa un celular resistente/);
});

test('first bot reply ending with a dangling colon is repaired before sending',()=>{
 const reply=customerFacingOpening({answer:'Te muestro opciones resistentes según lo habitual:',customerMessage:'busco celu q aguante golpes pa mi chamba',priorTurnCount:0});
 assert.match(reply,/Somos S&T Store/);
 assert.doesNotMatch(reply,/habitual:/);
 assert.match(reply,/\?/);
});
