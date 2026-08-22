import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRagRepository } from '../../src/adapters/supabase/SupabaseRagRepository.ts';

const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

test('falls back to exact institutional subcategory when vector results only contain category neighbors', async () => {
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);

    if (url.includes('/rest/v1/rpc/buscar_rag_institucional_v37')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      assert.equal(body.p_categoria, 'postventa');
      return jsonResponse([
        {
          categoria: 'postventa',
          subcategoria: 'cambios_devoluciones',
          contenido: 'Información oficial: Cambios dentro de 7 días.\nRespuesta base: Cambios dentro de 7 días.',
          similarity: 0.91,
        },
        {
          categoria: 'postventa',
          subcategoria: 'postventa_procedimiento',
          contenido: 'Información oficial: Escriba a postventa.\nRespuesta base: Escriba a postventa.',
          similarity: 0.88,
        },
      ]);
    }

    if (url.includes('/rest/v1/catalogo_productos?')) return jsonResponse([]);
    if (url.includes('/rest/v1/documents?')) return jsonResponse([]);
    if (url.includes('/rest/v1/rag_institucional?')) {
      return jsonResponse([
        {
          categoria: 'postventa',
          subcategoria: 'garantia_general',
          titulo: 'Garantía por defectos de fábrica',
          pregunta_canonica: '¿Qué cubre la garantía y cuánto dura?',
          preguntas_ejemplo: ['¿Cuánto tiene de garantía un celular?'],
          sinonimos: ['garantía general'],
          keywords: ['garantía', 'smartphones'],
          respuesta_base: 'Los smartphones cuentan con 12 meses de garantía por defectos de fábrica.',
          content: 'Información oficial: Los smartphones cuentan con 12 meses de garantía por defectos de fábrica.\nRespuesta base: Los smartphones cuentan con 12 meses de garantía por defectos de fábrica.',
          afirmable: true,
          prioridad: 50,
        },
      ]);
    }

    throw new Error(`Unexpected URL ${url}`);
  };

  const rag = new SupabaseRagRepository({
    url: 'https://example.supabase.co',
    key: 'test-key',
    embeddingProvider: { embed: async () => [0.1, 0.2, 0.3] },
    fetcher,
  });

  const evidence = await rag.searchInstitutional('¿Qué garantía dan?', 4);

  assert.equal(evidence.length, 1);
  assert.match(evidence[0].source, /postventa:garantia_general$/);
  assert.match(evidence[0].text, /12 meses/i);
});
