import type { QaScenario } from '../types.ts';

export const imageScenarios: QaScenario[] = [{
  id:'JOURNEY-IMAGES-LINKS',
  family:'TRUTH',
  title:'Imágenes de producto: conservar contexto y devolver solo enlaces',
  turns:[
    { message:'Estoy viendo el Armor X13', expected:{ activeProduct:'Armor X13' } },
    { message:'Mándame fotos del equipo', expected:{ intent:'IMAGE', queryTarget:'Armor X13', activeProduct:'Armor X13' } },
    { message:'Ahora mándame imágenes del Armor 22', expected:{ intent:'IMAGE', queryTarget:'Armor 22', activeProduct:'Armor X13', explicitSwitch:false } },
  ],
}];
