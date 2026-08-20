import type { RagRepository } from '../../ports/RagRepository.ts';
export class FakeRagRepository implements RagRepository {
  async search(query: string, product?: string | null) { return [{ text: `[FAKE TEST RAG] Evidencia simulada para ${product ?? 'consulta'}: ${query}`, source: 'FAKE_TEST_DATA', score: 1 }]; }
}
