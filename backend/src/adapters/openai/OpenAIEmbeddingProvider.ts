import type { EmbeddingProvider } from '../../ports/EmbeddingProvider.ts';

type Options={apiKey:string;model:string;baseUrl?:string;fetcher?:typeof fetch};

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly #apiKey:string;
  readonly #model:string;
  readonly #baseUrl:string;
  readonly #fetcher:typeof fetch;

  constructor(options:Options){
    this.#apiKey=options.apiKey;
    this.#model=options.model;
    this.#baseUrl=(options.baseUrl??'https://api.openai.com/v1').replace(/\/$/,'');
    this.#fetcher=options.fetcher??fetch;
  }

  async embed(text:string):Promise<number[]>{
    const input=String(text??'').trim();
    if(!input)throw new Error('embedding input is required');
    const response=await this.#fetcher(`${this.#baseUrl}/embeddings`,{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${this.#apiKey}`},
      body:JSON.stringify({model:this.#model,input,encoding_format:'float'}),
    });
    if(!response.ok)throw new Error(`OpenAI embeddings HTTP ${response.status}: ${await response.text()}`);
    const json:any=await response.json();
    const vector=json?.data?.[0]?.embedding;
    if(!Array.isArray(vector)||!vector.length||vector.some((x:unknown)=>typeof x!=='number'||!Number.isFinite(x))) {
      throw new Error('OpenAI embedding response did not contain a valid numeric embedding');
    }
    return vector.map(Number);
  }
}
