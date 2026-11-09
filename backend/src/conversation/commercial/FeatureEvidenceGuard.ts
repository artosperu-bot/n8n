import type { RagEvidence } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type Params = {
  message: string;
  answer: string;
  product: string | null;
  evidence: RagEvidence[];
};

/**
 * Distinguish a conventional camera from dedicated infrared/night-vision hardware.
 * A normal camera spec is NOT evidence that night vision is supported.
 */
export function guardNightVisionClaim({message,answer,product,evidence}:Params):string {
  const t=fold(message);
  const requested=/\b(?:camara|vision|ver|grabar|foto|fotos)\b[^?.!]{0,55}\b(?:nocturn[a-z]*|noche|oscuridad|infrarroj[a-z]*)\b/.test(t)
    || /\b(?:vision nocturna|camara nocturna|night vision)\b/.test(t);
  if(!requested)return answer;

  const confirmed=evidence.some(row=>{
    const fact=fold(row.text);
    const positive=/camara de vision nocturna\s*:\s*(?!no\b|false\b)|camara nocturna\s*:\s*(?!no\b|false\b)|sensor camara nocturna\s*:|led infrarrojos\s*:\s*[1-9]|vision nocturna\s*:\s*si\b/.test(fact);
    return positive;
  });
  if(confirmed)return answer;
  const named=String(product??'este modelo').trim();
  return `Sobre ${named}, tengo confirmadas las cámaras convencionales, pero no una función específica de visión nocturna. Si necesitas ver en completa oscuridad, podemos revisar un modelo que sí la tenga.`;
}
