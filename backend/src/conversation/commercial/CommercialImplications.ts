import { fold } from '../../shared/text.ts';

export function deriveCommercialImplications(problem:string|null|undefined,objection:string|null|undefined):string[]{
  const value=fold(`${problem??''} ${objection??''}`);
  const implications:string[]=[];
  if(/caida|golpe|agua|polvo|rotur|romp|durabilidad/.test(value))implications.push('RIESGO_INTERRUPCION_POR_DANO');
  if(/bateria|autonomia|carga|se apaga/.test(value))implications.push('RIESGO_INTERRUPCION_POR_AUTONOMIA');
  if(/precio|caro|presupuesto/.test(value))implications.push('RESTRICCION_DE_PRESUPUESTO');
  return implications;
}
