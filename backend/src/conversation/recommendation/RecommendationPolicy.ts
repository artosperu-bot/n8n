import type { ProductQuote, RagEvidence } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

export type RecommendationCandidate={quote:ProductQuote;evidence:RagEvidence[]};
export type RecommendationContext={
  priorities?:string[];
  useCase?:string|null;
  problem?:string|null;
  maxBudget?:number|null;
};
export type RankedRecommendation=RecommendationCandidate&{
  score:number;
  criteria:string[];
  criterionScores:Record<string,number>;
  reasons:string[];
  tradeoffs:string[];
  confidence:number;
};

type Metrics=Record<string,number>;

const PRIORITY_MAP:Record<string,string>={
  resistencia:'RESISTENCIA',bateria:'BATERIA',camara:'CAMARA',memoria:'MEMORIA',
  rendimiento:'RENDIMIENTO',conectividad:'CONECTIVIDAD',posicionamiento:'POSICIONAMIENTO',
  redes:'REDES',pantalla:'PANTALLA',fisico:'FISICO',precio:'PRECIO',termica:'TERMICA',
};

function unique(values:string[]):string[]{return [...new Set(values.filter(Boolean))];}
function numberAfter(text:string,label:RegExp,unit:RegExp):number|null{
  const pattern=`(?:${label.source})[^\\d]{0,35}(\\d+(?:[.,]\\d+)?)\\s*(?:${unit.source})`;
  const raw=text.match(new RegExp(pattern,'i'))?.[1];
  if(!raw)return null;
  const n=Number(raw.replace(',','.'));
  return Number.isFinite(n)?n:null;
}
function yes(text:string,rx:RegExp):number{return rx.test(text)?1:0;}
function evidenceText(rows:RagEvidence[],section:string):string{
  return rows.filter(r=>fold(r.section??'')===fold(section)).map(r=>fold(r.text)).join('\n');
}
function criterionForPriority(value:string):string|null{
  const t=fold(value);
  if(PRIORITY_MAP[t])return PRIORITY_MAP[t];
  if(/termic|temperatura|calor|inspeccion.*temperatura/.test(t))return 'TERMICA';
  if(/camara|foto|fotografia|video|imagen/.test(t))return 'CAMARA';
  if(/almacen|espacio|memoria|micro.?sd|ram/.test(t))return 'MEMORIA';
  if(/compart|redes sociales|subir.*red|conect/.test(t))return 'CONECTIVIDAD';
  if(/5g|4g|lte|datos moviles/.test(t))return 'REDES';
  if(/gps|ubicacion|posicion/.test(t))return 'POSICIONAMIENTO';
  if(/golpe|caida|agua|polvo|rugged|resisten|durab/.test(t))return 'RESISTENCIA';
  if(/bateria|autonomia|carga/.test(t))return 'BATERIA';
  if(/procesador|rendimiento|velocidad|juego/.test(t))return 'RENDIMIENTO';
  if(/pantalla|display|hz/.test(t))return 'PANTALLA';
  if(/peso|dimension|tamano/.test(t))return 'FISICO';
  return null;
}
function metricsFor(rows:RagEvidence[],criterion:string):Metrics{
  const text=evidenceText(rows,criterion);
  if(!text)return{};
  if(criterion==='BATERIA')return{
    mah:numberAfter(text,/capacidad(?:\s+de)?\s+bateria|bateria/,/mah/)??0,
    chargeW:numberAfter(text,/carga(?:\s+cableada)?/,/w/)??0,
    callHours:numberAfter(text,/autonomia(?:\s+en)?\s+llamadas?/,/horas?|h/)??0,
    standbyHours:numberAfter(text,/autonomia(?:\s+en)?\s+espera/,/horas?|h/)??0,
  };
  if(criterion==='RESISTENCIA')return{
    fallM:numberAfter(text,/resistencia(?:\s+a)?\s+caidas?/,/m/)??0,
    depthM:numberAfter(text,/profundidad\s+ip68/,/m/)??0,
    ip68:yes(text,/\bip68\b[^\n.]{0,20}\bsi\b/),
    ip69k:yes(text,/\bip69k\b[^\n.]{0,20}\bsi\b/),
    mil:yes(text,/mil[- ]?std[- ]?810h[^\n.]{0,20}\bsi\b/),
  };
  if(criterion==='MEMORIA')return{
    ram:numberAfter(text,/ram\s+fisica/,/gb/)??0,
    storage:numberAfter(text,/almacenamiento(?:\s+interno)?/,/gb/)??0,
    microsd:numberAfter(text,/microsd\s+maxima/,/gb/)??0,
  };
  if(criterion==='CAMARA')return{
    mainMp:numberAfter(text,/camara(?:\s+principal)?/,/mp/)??0,
    nightMp:numberAfter(text,/vision\s+nocturna|camara\s+nocturna/,/mp/)??0,
    frontMp:numberAfter(text,/camara\s+frontal/,/mp/)??0,
    eis:yes(text,/estabilizacion[^\n.]{0,30}\beis\b[^\n.]{0,20}\bsi\b/),
    video2k:yes(text,/resolucion\s+maxima\s+de\s+video[^\n.]{0,20}\b2k\b/),
  };
  if(criterion==='TERMICA')return{
    thermal:yes(text,/camara\s+termica[^\n.]{0,20}\bsi\b/),
    hz:numberAfter(text,/frecuencia\s+termica/,/hz/)??0,
    resX:numberAfter(text,/resolucion\s+termica\s+horizontal/,/px/)??0,
    resY:numberAfter(text,/resolucion\s+termica\s+vertical/,/px/)??0,
    maxC:numberAfter(text,/temperatura\s+maxima\s+termica/,/(?:°?c|c)/)??0,
  };
  if(criterion==='PANTALLA')return{
    hz:numberAfter(text,/frecuencia|refresco|pantalla/,/hz/)??0,
  };
  if(criterion==='FISICO')return{
    weightG:numberAfter(text,/peso/,/g/)??0,
  };
  if(criterion==='POSICIONAMIENTO')return{
    systems:['gps','glonass','galileo','beidou','qzss'].reduce((n,key)=>n+(new RegExp(`\\b${key}\\b`).test(text)?1:0),0),
  };
  if(criterion==='REDES'||criterion==='CONECTIVIDAD')return{
    fiveG:yes(text,/\b5g\b[^\n.]{0,25}\bsi\b|conectividad\s+5g[^\n.]{0,20}\bsi\b/),
    fourG:yes(text,/\b4g\b|\blte\b/),
    nfc:yes(text,/\bnfc\b[^\n.]{0,25}\bsi\b/),
    wifi:yes(text,/\bwi[ -]?fi\b/),
  };
  return{};
}

function criteriaFrom(context:RecommendationContext):string[]{
  const explicit=(context.priorities??[]).map(criterionForPriority).filter((x):x is string=>Boolean(x));
  const use=fold(context.useCase??'');
  const problem=fold(context.problem??'');
  const combined=`${use} ${problem}`;
  const inferred:string[]=[];
  if(/delivery|repart|logistica/.test(use))inferred.push('BATERIA','RESISTENCIA','POSICIONAMIENTO','REDES');
  if(/campo|construccion|obra|tecnico/.test(use))inferred.push('RESISTENCIA','BATERIA');
  if(/caida|durabilidad|golpe/.test(problem))inferred.push('RESISTENCIA');
  if(/autonomia|bateria/.test(problem))inferred.push('BATERIA');
  if(/foto|fotografia|camara|video|redes sociales|subir.*red/.test(combined))inferred.push('CAMARA','MEMORIA','CONECTIVIDAD');
  if(/termic|temperatura|calor|inspeccion/.test(combined)&&/temperatura|termic|calor/.test(combined))inferred.push('TERMICA','RESISTENCIA');
  const result=unique([...explicit,...inferred]).filter(x=>x!=='PRECIO');
  return result.length?result:['RESISTENCIA','BATERIA'];
}

function weightedRaw(metrics:Metrics,criterion:string):number|null{
  const vals=Object.values(metrics).filter(v=>Number.isFinite(v)&&v>0);
  if(!vals.length)return null;
  if(criterion==='BATERIA')return (metrics.mah??0)*0.55+(metrics.chargeW??0)*80+(metrics.callHours??0)*25+(metrics.standbyHours??0)*2;
  if(criterion==='RESISTENCIA')return (metrics.fallM??0)*40+(metrics.depthM??0)*20+((metrics.ip68??0)+(metrics.ip69k??0)+(metrics.mil??0))*20;
  if(criterion==='MEMORIA')return (metrics.ram??0)*20+(metrics.storage??0)+(metrics.microsd??0)*0.05;
  if(criterion==='CAMARA')return (metrics.mainMp??0)+(metrics.nightMp??0)*0.6+(metrics.frontMp??0)*0.2+(metrics.eis??0)*10+(metrics.video2k??0)*8;
  if(criterion==='TERMICA')return (metrics.thermal??0)*1000+(metrics.hz??0)*4+(metrics.resX??0)+(metrics.resY??0)+(metrics.maxC??0)*0.2;
  if(criterion==='PANTALLA')return metrics.hz??null;
  if(criterion==='FISICO')return metrics.weightG?1/metrics.weightG:null;
  if(criterion==='POSICIONAMIENTO')return metrics.systems??null;
  if(criterion==='REDES'||criterion==='CONECTIVIDAD')return (metrics.fiveG??0)*4+(metrics.fourG??0)*2+(metrics.nfc??0)+(metrics.wifi??0);
  return null;
}

function explain(criterion:string,metrics:Metrics):string|null{
  if(criterion==='BATERIA'&&metrics.mah)return `batería ${metrics.mah} mAh${metrics.chargeW?` y carga ${metrics.chargeW} W`:''}`;
  if(criterion==='RESISTENCIA'&&metrics.fallM)return `resistencia a caída ${metrics.fallM} m${metrics.depthM?` e IP68 hasta ${metrics.depthM} m`:''}`;
  if(criterion==='MEMORIA'&&(metrics.ram||metrics.storage))return `${metrics.ram||0} GB RAM / ${metrics.storage||0} GB almacenamiento`;
  if(criterion==='CAMARA'&&metrics.mainMp)return `cámara principal ${metrics.mainMp} MP${metrics.nightMp?` y nocturna ${metrics.nightMp} MP`:''}`;
  if(criterion==='TERMICA'&&metrics.thermal)return `cámara térmica${metrics.resX&&metrics.resY?` ${metrics.resX}×${metrics.resY}`:''}${metrics.hz?` a ${metrics.hz} Hz`:''}`;
  if(criterion==='POSICIONAMIENTO'&&metrics.systems)return `${metrics.systems} sistemas de posicionamiento detectados`;
  return null;
}

export function rankRecommendations(candidates:RecommendationCandidate[],context:RecommendationContext={}):RankedRecommendation[]{
  const filtered=candidates.filter(c=>{
    if(context.maxBudget!=null&&c.quote.price!=null&&c.quote.price>context.maxBudget)return false;
    if(c.quote.stock!=null&&c.quote.stock<=0)return false;
    return true;
  });
  if(!filtered.length)return[];
  const criteria=criteriaFrom(context);
  const rows=filtered.map((candidate,index)=>({
    candidate,index,
    metrics:Object.fromEntries(criteria.map(c=>[c,metricsFor(candidate.evidence,c)])) as Record<string,Metrics>,
    raw:{} as Record<string,number|null>,
  }));
  for(const row of rows)for(const criterion of criteria)row.raw[criterion]=weightedRaw(row.metrics[criterion],criterion);

  const bounds=Object.fromEntries(criteria.map(criterion=>{
    const values=rows.map(r=>r.raw[criterion]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
    return [criterion,{min:values.length?Math.min(...values):0,max:values.length?Math.max(...values):0}];
  })) as Record<string,{min:number;max:number}>;

  const ranked:(RankedRecommendation&{__index:number})[]=rows.map(row=>{
    const criterionScores:Record<string,number>={};
    const reasons:string[]=[];
    let total=0,covered=0;
    for(const criterion of criteria){
      const raw=row.raw[criterion];
      if(raw==null)continue;
      const {min,max}=bounds[criterion];
      const normalized=max===min?(raw>0?1:0):(raw-min)/(max-min);
      criterionScores[criterion]=normalized;
      total+=normalized;covered+=1;
      const reason=explain(criterion,row.metrics[criterion]);if(reason)reasons.push(reason);
    }
    const score=covered?total/covered:0;
    return {
      ...row.candidate,
      score,
      criteria,
      criterionScores,
      reasons,
      tradeoffs:[],
      confidence:criteria.length?covered/criteria.length:0,
      __index:row.index,
    };
  });

  const priceIsCriterion=(context.priorities??[]).some(p=>criterionForPriority(p)==='PRECIO');
  ranked.sort((a,b)=>b.score-a.score||b.confidence-a.confidence||(priceIsCriterion?Number(a.quote.price??Infinity)-Number(b.quote.price??Infinity):a.__index-b.__index));
  if(ranked.length>1){
    for(const item of ranked){
      const missing=criteria.filter(c=>item.criterionScores[c]==null);
      if(missing.length)item.tradeoffs.push(`sin evidencia comparable suficiente en ${missing.join(', ')}`);
    }
  }
  return ranked.map(({__index,...item})=>item);
}
