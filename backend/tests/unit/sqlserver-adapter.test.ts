import test from 'node:test';
import assert from 'node:assert/strict';
import { SqlServerErpRepository } from '../../src/adapters/sqlserver/SqlServerErpRepository.ts';

function driver(rows:any[], calls:any[]){
  return {
    NVarChar:(n:number)=>({type:'NVarChar',n}),
    Int:{type:'Int'},
    Bit:{type:'Bit'},
    ConnectionPool:class{
      on(){}
      async connect(){return this;}
      request(){
        const inputs:any[]=[];
        return {
          input(name:string,type:any,value:any){inputs.push({name,type,value});return this;},
          async execute(proc:string){calls.push({proc,inputs});return {recordset:rows};}
        };
      }
    }
  };
}

test('quote uses canonical sp_BuscarProductosVenta signature', async()=>{
  const calls:any[]=[];
  const erp=new SqlServerErpRepository({server:'PC020',port:1433,database:'DB_ST',user:'stech_app',password:'secret',encrypt:false,trustServerCertificate:true,catalogProcedure:'dbo.sp_BuscarProductosVenta',driverLoader:async()=>driver([{producto:'Armor 22',producto_codigo:'P000049',precio:1299,stock:7,moneda:'PEN'}],calls) as any});
  const q=await erp.getProductQuote('Armor 22');
  assert.equal(calls[0].proc,'dbo.sp_BuscarProductosVenta');
  assert.deepEqual(calls[0].inputs.map((x:any)=>[x.name,x.value]),[
    ['TextoBusqueda','Armor 22'],['CategoriaCodigo',null],['SubcategoriaCodigo',null],['SoloConStock',0],['MaxResultados',20]
  ]);
  assert.equal(q?.source,'SQL_SERVER');
  assert.equal(q?.price,1299);
});

test('budget reuses catalog procedure and filters authoritative price in backend', async()=>{
  const calls:any[]=[];
  const rows=[
    {producto:'Armor 25T Pro',precio:1899,stock:2},
    {producto:'Armor 22',precio:1199,stock:3},
    {producto:'Armor X13',precio:899,stock:4},
    {producto:'Sin precio',precio:null,stock:1}
  ];
  const erp=new SqlServerErpRepository({server:'PC020',port:1433,database:'DB_ST',user:'stech_app',password:'secret',encrypt:false,trustServerCertificate:true,catalogProcedure:'dbo.sp_BuscarProductosVenta',driverLoader:async()=>driver(rows,calls) as any});
  const result=await erp.listProductsWithinBudget(1500);
  assert.equal(calls[0].proc,'dbo.sp_BuscarProductosVenta');
  assert.deepEqual(calls[0].inputs.map((x:any)=>[x.name,x.value]),[
    ['TextoBusqueda',null],['CategoriaCodigo',null],['SubcategoriaCodigo',null],['SoloConStock',0],['MaxResultados',100]
  ]);
  assert.deepEqual(result.map(x=>x.product),['Armor X13','Armor 22']);
});

test('mssql CommonJS module loaded through ESM default export is supported', async()=>{
  const calls:any[]=[];
  const actualDriver=driver([{producto:'Armor 22',precio:1299,stock:2}],calls);
  const erp=new SqlServerErpRepository({server:'PC020',port:1433,database:'DB_ST',user:'stech_app',password:'secret',encrypt:false,trustServerCertificate:true,catalogProcedure:'dbo.sp_BuscarProductosVenta',driverLoader:async()=>({default:actualDriver}) as any});
  const q=await erp.getProductQuote('Armor 22');
  assert.equal(q?.price,1299);
  assert.equal(calls[0].proc,'dbo.sp_BuscarProductosVenta');
});
