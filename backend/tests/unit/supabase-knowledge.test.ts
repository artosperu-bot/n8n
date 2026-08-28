import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRagRepository } from '../../src/adapters/supabase/SupabaseRagRepository.ts';

test('retrieves product and institutional evidence without vector RPC calls', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url) => {
    const u = String(url); calls.push(u);
    if (u.includes('/catalogo_productos')) return Response.json([{ producto_id:'P-X13', nombre_corto:'Armor X13', nombre:'Ulefone Armor X13', modelo:'Armor X13', producto_codigo:'P000048' }]);
    if (u.includes('/documents')) return Response.json([{ producto_id:'P-X13', content:'Sección BATERIA. Capacidad de batería: 6320 mAh.', metadata:{ seccion:'BATERIA', titulo:'Batería Armor X13', keywords:'bateria_mah autonomia' } }]);
    if (u.includes('/rag_institucional')) return Response.json([{ categoria:'pagos', subcategoria:'contraentrega', titulo:'Pago contra entrega no disponible', pregunta_canonica:'¿Puedo pagar contra entrega?', preguntas_ejemplo:['contraentrega'], sinonimos:['pago al recibir'], keywords:['contraentrega'], respuesta_base:'Por el momento no contamos con pago contra entrega.', afirmable:true, prioridad:50, activo:true }]);
    throw new Error(`unexpected ${u}`);
  };
  const repo = new SupabaseRagRepository({ url:'https://example.supabase.co', key:'service', rpc:'unused', fetcher });
  const product = await repo.search('¿Qué batería tiene?', 'Armor X13');
  assert.match(product[0]?.text ?? '', /6320/);
  const policy = await repo.search('¿Trabajan contraentrega?', null);
  assert.match(policy[0]?.text ?? '', /no contamos/i);
  assert.equal(calls.some(x => x.includes('/rpc/')), false);
});
