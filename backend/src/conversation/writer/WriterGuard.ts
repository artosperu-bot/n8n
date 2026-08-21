import type { LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';

export type WriterGuardResult = {
  answer: string;
  model: string;
  llmResult: LlmResult | null;
  fallback: { delivered: boolean; error?: string };
};

function guardGeneratedAnswer(input: LlmWriteInput, answer: string): string | null {
  const intent = String(input.intent ?? '').toUpperCase();
  const priceAllowed = ['PRICE','QUOTE','PRICE_AVAILABILITY'].includes(intent);
  if (!priceAllowed && /\bS\/\s*\d/i.test(answer)) return 'UNSOLICITED_PRICE';

  if (/\b(ya\s+reserve|ya\s+reserv[eé]|reserva\s+(?:quedo|qued[oó]|confirmada)|pedido\s+(?:creado|registrado)|compra\s+(?:realizada|confirmada))\b/i.test(answer)) {
    return 'UNVERIFIED_ACTION';
  }

  const stockLeak = /(?:stock|disponib)[^\n.]{0,35}\b\d+\s*(?:unidades?|uds?)\b|\b\d+\s*(?:unidades?|uds?)\b[^\n.]{0,35}(?:stock|disponib)/i;
  if (stockLeak.test(answer)) return 'RAW_STOCK_QUANTITY';
  return null;
}

export async function safeWrite(llm: LlmProvider, input: LlmWriteInput, fallbackAnswer: string): Promise<WriterGuardResult> {
  try {
    const result = await llm.write(input);
    const violation = guardGeneratedAnswer(input, result.text);
    if (violation) {
      return {
        answer: fallbackAnswer,
        model: result.model,
        llmResult: result,
        fallback: { delivered: false, error: violation },
      };
    }
    return { answer: result.text, model: result.model, llmResult: result, fallback: { delivered: true } };
  } catch (error) {
    return {
      answer: fallbackAnswer,
      model: 'deterministic-fallback-v0.4',
      llmResult: null,
      fallback: { delivered: false, error: error instanceof Error ? error.message : String(error) },
    };
  }
}
