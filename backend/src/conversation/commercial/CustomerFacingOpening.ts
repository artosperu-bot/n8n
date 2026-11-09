import { fold } from '../../shared/text.ts';

type OpeningInput = {
  answer: string;
  customerMessage: string;
  priorTurnCount: number;
};

/**
 * Customer-facing opening rule: greet ONCE per new chat, not on every turn.
 * Only repairs empty/robotic first replies; never invents prices, stock or specs.
 */
export function customerFacingOpening({ answer, customerMessage, priorTurnCount }: OpeningInput): string {
  const raw = String(answer ?? '').trim();
  if (priorTurnCount > 0) return raw;

  const normalizedAnswer = fold(raw);
  const unusable = !raw || (raw.endsWith(':') && !raw.includes('\n') && raw.length < 120) ||
    /^(aun no hay una opcion que destaque|podemos ayudarte\s*:?|necesito un dato\s*:?|esa opcion encaja con los criterios|listo, tomo esa informacion como referencia)/i.test(normalizedAnswer);
  const request = fold(customerMessage);

  let response = raw;
  if (unusable) {
    if (/golp|caid|resisten|rugged|rudo|trabaj|chamb|obra|mina|campo|taller|almacen/.test(request)) {
      response = 'Te ayudo a encontrar un celular resistente para tu trabajo. ¿Lo usarías principalmente en obra, campo, taller o almacén?';
    } else if (/precio|cuanto|cuesta|stock|disponib/.test(request)) {
      response = 'Con gusto te ayudo a confirmar ese dato. ¿Qué modelo estás buscando?';
    } else {
      response = 'Cuéntame qué tipo de equipo estás buscando y te ayudo a encontrar una opción.';
    }
  }

  // The brand introduction replaces redundant generic greeting.
  response = response.replace(/^(?:¡?hola|¡?buenas)[!,.\s—–-]*(?=\p{L})/iu,'');
  response = response.trim();
  if (response) response = response.charAt(0).toLocaleUpperCase('es') + response.slice(1);
  return `¡Buenas! Somos S&T Store 👋\n${response}`;
}
