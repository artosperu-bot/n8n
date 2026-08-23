import type { RagEvidence } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

export type HardRequirement='NFC'|'5G'|'VISION_NOCTURNA'|'CAMARA_TERMICA';

function evidenceText(rows:RagEvidence[]):string{
  return fold(rows.map(row=>`${row.section??''}\n${row.text??''}`).join('\n'));
}

export function hardRequirementsFromPriorities(priorities:string[]=[]):HardRequirement[]{
  const result:HardRequirement[]=[];
  for(const priority of priorities){
    const text=fold(priority);
    if(/\bnfc\b/.test(text))result.push('NFC');
    if(/\b5g\b/.test(text))result.push('5G');
    if(/vision nocturna|camara nocturna|nocturna/.test(text))result.push('VISION_NOCTURNA');
    if(/camara termica|termica|thermal/.test(text))result.push('CAMARA_TERMICA');
  }
  return [...new Set(result)];
}

export function satisfiesHardRequirement(rows:RagEvidence[],requirement:HardRequirement):boolean{
  const text=evidenceText(rows);
  if(!text)return false;
  if(requirement==='NFC')return /\bnfc\b[^\n.;]{0,30}\b(?:si|sí|yes|true)\b/.test(text);
  if(requirement==='5G')return /\b(?:conectividad\s+|red\s+|soporte\s+)?5g\b[^\n.;]{0,30}\b(?:si|sí|yes|true)\b/.test(text);
  if(requirement==='VISION_NOCTURNA')return /\b(?:camara\s+)?vision\s+nocturna\b[^\n.;]{0,40}(?:\b(?:si|sí|yes|true)\b|\d+(?:[.,]\d+)?\s*mp\b)/.test(text)
    || /\bcamara\s+nocturna\b[^\n.;]{0,40}(?:\b(?:si|sí|yes|true)\b|\d+(?:[.,]\d+)?\s*mp\b)/.test(text);
  if(requirement==='CAMARA_TERMICA')return /\bcamara\s+termica\b[^\n.;]{0,35}\b(?:si|sí|yes|true)\b/.test(text);
  return false;
}

export function satisfiesAllHardRequirements(rows:RagEvidence[],priorities:string[]=[]):boolean{
  const requirements=hardRequirementsFromPriorities(priorities);
  return requirements.every(requirement=>satisfiesHardRequirement(rows,requirement));
}
