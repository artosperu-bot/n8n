import type { ErpRepository } from '../../ports/ErpRepository.ts';
import type { CatalogResolution, CategoryOption, OrderLookup, ProductImage, ProductQuote, SubcategoryOption } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type Options = { url:string; token?:string; catalogProcedure:string; fetcher?:typeof fetch };

function tokens(value:string):string[]{return fold(value).match(/[a-z0-9]+/g)??[];}
function editDistance(a:string,b:string):number{
  const rows=a.length+1,cols=b.length+1;
  const d=Array.from({length:rows},()=>Array<number>(cols).fill(0));
  for(let i=0;i<rows;i++)d[i][0]=i;
  for(let j=0;j<cols;j++)d[0][j]=j;
  for(let i=1;i<rows;i++)for(let j=1;j<cols;j++){
    const cost=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[a.length][b.length];
}
function looksDateLike(text:string):boolean{
  const t=fold(text);
  return /\b(?:dia|fecha|llega|llegue|entrega|entregar|agosto|septiembre|octubre|noviembre|diciembre|enero|febrero|marzo|abril|mayo|junio|julio)\b[^.!?]{0,25}\b\d{1,2}\b/.test(t);
}
function looksQuantityLike(text:string,model:string):boolean{
  const t=fold(text),m=model.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`\\b${m}\\s*(?:unidades?|equipos?|celulares?|uds?)\\b|\\b(?:cantidad|qty)\\s*[:=]?\\s*${m}\\b`,'i').test(t);
}
function numericModelReference(query:string,model:string):boolean{
  if(/[a-z]/i.test(model))return true;
  if(looksDateLike(query)||looksQuantityLike(query,model))return false;
  const t=fold(query),q=tokens(query),m=model.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!q.includes(model))return false;
  if(q.length<=5)return true;
  return new RegExp(`\\b(?:el|modelo|armor|quiero|prefiero|elijo|vs|contra)\\s+(?:modelo\\s+)?${m}\\b|\\b${m}\\s+(?:quiero|prefiero|elijo|es\\s+mejor|vs|contra)\\b`,'i').test(t);
}
function typoScore(query:string,product:string):number{
  const q=tokens(query),p=tokens(product);
  let score=0;
  const modelTokens=p.filter(x=>/\d/.test(x));
  for(const model of modelTokens){
    if(!q.includes(model))continue;
    score+=/[a-z]/.test(model)?3:(numericModelReference(query,model)?3:2);
  }
  const family=p.filter(x=>!/[0-9]/.test(x)&&x.length>=4);
  if(family.some(word=>q.some(candidate=>candidate===word||candidate.length>=4&&editDistance(candidate,word)<=1)))score+=1;
  return score;
}

export class SqlBridgeErpRepository implements ErpRepository {
  readonly #url:string; readonly #token?:string; readonly #catalogProcedure:string; readonly #fetcher:typeof fetch;
  constructor(options:Options){this.#url=options.url;this.#token=options.token;this.#catalogProcedure=options.catalogProcedure;this.#fetcher=options.fetcher??fetch;}
  #escape(value:string){return value.replace(/'/g,"''");}
  #nullableLiteral(value?:string|null){const clean=String(value??'').trim();return clean?`'${this.#escape(clean)}'`:'NULL';}
  async #call(query:string):Promise<any[]>{const headers:Record<string,string>={'content-type':'application/json'};if(this.#token)headers.authorization=`Bearer ${this.#token}`;const response=await this.#fetcher(this.#url,{method:'POST',headers,body:JSON.stringify({query})});const raw=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`SQL bridge HTTP ${response.status}: ${raw?.error??'UNKNOWN_ERROR'}`);if(raw?.ok===false)throw new Error(`SQL bridge: ${raw?.error??'UNKNOWN_ERROR'}`);return Array.isArray(raw?.rows)?raw.rows:[];}
  #map(raw:any):ProductQuote|null{if(!raw)return null;const product=String(raw.product??raw.producto??raw.nombre??raw.nombre_corto??'').trim();if(!product)return null;const n=(v:any):number|null=>v==null||v===''?null:Number(v);return{product,shortName:raw.nombre_corto??null,productCode:raw.productCode??raw.producto_codigo??raw.codigo??null,productRagId:raw.productRagId??raw.producto_rag_id??null,internalId:n(raw.producto_id_interno??raw.id),sku:raw.sku??null,partNumber:raw.part_number??null,ean:raw.ean??null,price:n(raw.price??raw.precio),stock:n(raw.stock),currency:String(raw.currency??raw.moneda??'PEN'),categoryCode:raw.categoria_codigo??null,category:raw.categoria??null,subcategoryCode:raw.subcategoria_codigo??null,subcategory:raw.subcategoria??null,warrantyMonths:n(raw.garantia_meses),commercialState:raw.estado_comercial??null,matchScore:n(raw.score),matchPosition:n(raw.posicion),matchCount:n(raw.cantidad_resultados),requiresClarification:raw.requiere_aclaracion==null?null:Boolean(raw.requiere_aclaracion),resultType:raw.tipo_resultado??null,source:'SQL_BRIDGE'};}
  async searchProducts(text:string,maxResults=20):Promise<ProductQuote[]>{
    const limit=Math.max(1,Math.min(50,Math.trunc(maxResults||20)));
    const rows=await this.#call(`EXEC ${this.#catalogProcedure} @TextoBusqueda=N'${this.#escape(text)}', @CategoriaCodigo=NULL, @SubcategoriaCodigo=NULL, @SoloConStock=0, @MaxResultados=${limit};`);
    const direct=rows.map(row=>this.#map(row)).filter((row):row is ProductQuote=>row!==null);
    if(direct.length||looksDateLike(text))return direct;
    const catalog=await this.listCatalog({onlyWithStock:false});
    const scored=catalog.map((quote,index)=>({quote,index,score:typoScore(text,quote.shortName??quote.product)})).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score||a.index-b.index);
    if(!scored.length)return[];
    if(scored[1]&&scored[1].score===scored[0].score)return[];
    return [scored[0].quote].slice(0,limit);
  }
  async getProductQuote(product:string):Promise<ProductQuote|null>{return(await this.searchProducts(product,20))[0]??null;}
  async listProductsWithinBudget(maxBudget:number):Promise<ProductQuote[]>{const rows=await this.listCatalog({});return rows.filter(row=>row.price!=null&&row.price<=maxBudget).sort((a,b)=>(a.price??Number.MAX_SAFE_INTEGER)-(b.price??Number.MAX_SAFE_INTEGER));}
  async getProductImages(product:string,maxImages=10):Promise<ProductImage[]>{const limit=Math.max(1,Math.min(20,Math.trunc(maxImages||10)));const rows=await this.#call(`EXEC dbo.sp_BuscarImagenesProductoVenta @TextoBusqueda=N'${this.#escape(product)}', @MaxImagenes=${limit};`);const seen=new Set<string>();const out:ProductImage[]=[];for(const row of rows){const url=String(row.url_imagen??row.url??'').trim();if(!/^https?:\/\//i.test(url)||seen.has(url))continue;seen.add(url);out.push({url,type:row.tipo_imagen??row.tipo??null,source:'SQL_BRIDGE'});}return out;}
  async resolveCatalogContext(text:string):Promise<CatalogResolution[]>{return this.#call(`EXEC dbo.sp_ResolverContextoCatalogoVenta @TextoBusqueda=N'${this.#escape(text)}';`);}
  async listCatalog(filters:{categoryCode?:string|null;subcategoryCode?:string|null;onlyWithStock?:boolean}={}):Promise<ProductQuote[]>{const query=`EXEC dbo.sp_ListarCatalogoVenta @CategoriaCodigo=${this.#nullableLiteral(filters.categoryCode)}, @SubcategoriaCodigo=${this.#nullableLiteral(filters.subcategoryCode)}, @SoloConStock=${filters.onlyWithStock?1:0}, @SoloActivos=1;`;return(await this.#call(query)).map(row=>this.#map(row)).filter((row):row is ProductQuote=>row!==null);}
  async listCategories():Promise<CategoryOption[]>{const rows=await this.#call('EXEC dbo.sp_ListarCategoriasVenta @SoloActivas=1;');return rows.map(row=>({code:String(row.categoria_codigo??row.codigo??''),name:String(row.categoria??row.nombre??''),description:row.descripcion??null})).filter(row=>row.code&&row.name);}
  async listSubcategories(categoryCode?:string|null):Promise<SubcategoryOption[]>{const rows=await this.#call(`EXEC dbo.sp_ListarSubcategoriasVenta @CategoriaCodigo=${this.#nullableLiteral(categoryCode)}, @SoloActivas=1;`);return rows.map(row=>({code:String(row.subcategoria_codigo??row.codigo??''),name:String(row.subcategoria??row.nombre??''),categoryCode:row.categoria_codigo??null,category:row.categoria??null,description:row.descripcion??null})).filter(row=>row.code&&row.name);}
  async consultOrder(orderNumber:string,email:string):Promise<OrderLookup|null>{const order=orderNumber.trim(),mail=email.trim();if(!order||!mail)throw new Error('order number and email are required');const rows=await this.#call(`EXEC dbo.sp_ConsultarPedido @NumeroPedido='${this.#escape(order)}', @EmailCliente='${this.#escape(mail)}';`);return rows[0]??null;}
}
