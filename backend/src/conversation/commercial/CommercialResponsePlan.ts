import type { CommercialResponseMode, CommercialResponsePlan, LlmWriteInput } from '../../ports/LlmProvider.ts';

const FORBIDDEN_CLAIMS = [
  'UNVERIFIED_FACT',
  'FAKE_SCARCITY',
  'FAKE_URGENCY',
  'INVENTED_SOCIAL_PROOF',
  'UNSUPPORTED_PERFORMANCE',
  'UNAUTHORIZED_ACTION',
] as const;

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))];
}

function exactNba(input: LlmWriteInput): string {
  return String(input.finalExecutableNba ?? input.executableNba ?? input.nextBestAction ?? 'ANSWER_ONLY').toUpperCase();
}

function responseMode(input: LlmWriteInput, nba: string): CommercialResponseMode {
  const intent = String(input.resolvedCurrentIntent ?? input.intent ?? '').toUpperCase();
  const strategy = String(input.state?.commercialStrategy ?? '').toUpperCase();
  const hasGenuineContext = Boolean(
    input.useCase
    || input.problem
    || (input.priorities?.length ?? 0) >= 2
    || (input.implications?.length ?? 0) > 0
  );
  const hasContextualMove = input.commercialMove?.kind === 'CONTEXTUAL_BENEFIT';
  const hasVerifiedFeatures = (input.verifiedFeatures?.length ?? 0) > 0;

  if (nba === 'ASSISTED_HANDOFF') return 'HANDOFF';
  if (
    input.purchaseSignal === true
    || intent === 'PURCHASE'
    || nba === 'COLLECT_RESERVATION_DATA'
    || nba === 'EXECUTE_RESERVATION'
  ) return 'PURCHASE_PROGRESS';
  if (intent === 'HANDLE_PRICE_OBJECTION' || strategy === 'LAER' || Boolean(input.objection)) return 'OBJECTION_LAER';
  if (intent === 'COMPARE' || strategy === 'ELECCION_GUIADA') return 'GUIDED_CHOICE';
  if (nba === 'ASK_MISSING_FACT') return 'DISCOVERY_SPIN';
  if (nba === 'SOFT_CLOSE') return 'SOFT_CLOSE';
  if (hasContextualMove || (strategy === 'FAB_SPIN' && hasVerifiedFeatures && hasGenuineContext)) return 'CONTEXTUAL_FAB';
  return 'FACTUAL_DIRECT';
}

export function buildCommercialResponsePlan(input: LlmWriteInput, factualCore: string): CommercialResponsePlan {
  const nba = exactNba(input);
  const mode = responseMode(input, nba);
  const contextFocus = unique([
    input.useCase,
    input.problem,
    ...(input.priorities ?? []),
    input.objection,
  ]).slice(0, 5);
  const maxQuestions: 0 | 1 = ['ASK_MISSING_FACT', 'SOFT_CLOSE', 'COLLECT_RESERVATION_DATA'].includes(nba) ? 1 : 0;

  // prepareCommercialWriteInput() has already reduced the requested action to a
  // capability-compatible executable NBA. The response planner may expose that
  // exact action to the writer, but it never creates an additional action.
  const allowedActions = nba === 'ANSWER_ONLY' ? [] : [nba];

  return {
    mode,
    strategy: String(input.state?.commercialStrategy ?? '').trim() || null,
    shouldUseLlm: !['FACTUAL_DIRECT', 'HANDOFF'].includes(mode),
    acknowledgeContext: contextFocus.length > 0 && mode !== 'FACTUAL_DIRECT',
    contextFocus,
    factualCore: String(factualCore ?? '').trim(),
    exactNba: nba,
    maxQuestions,
    allowedActions,
    forbiddenClaims: [...FORBIDDEN_CLAIMS],
  };
}
