# STECH — catálogo comercial materializado en Supabase (fase QA)

## Regla de autoridad
El ERP/V8 sigue siendo el origen de productos/canales. Supabase es la **réplica de lectura del chatbot**, no una segunda fuente que deba recalcular precios en cada turno.

```text
PC020 / DB_DISTRIBUIDORES / CHN_PUBLICACION (cuenta WEB_STECH, id=14)
           |
           | Sync read-only de SQL, validación de SKU, oferta y timestamp
           v
Supabase arm_channel_offers (WEB_STECH, por workspace+PN)
           |
           | ARM identity arm_products + catalogo_productos
           v
SupabaseErpRepository (backend de desarrollo, ERP_MODE=supabase)
           |
           v
HybridConversationEngine → GPT-5 mini → respuesta comercial
```

### Fuentes exactas
- Identidad del producto: `arm_products.partnumber` ↔ `catalogo_productos.part_number`, solo equivalencias exactas.
- Precio de lista en el canal web: `CHN_PUBLICACION.precio_actual`.
- **Precio efectivo** para cliente: `TRY_CONVERT(decimal, JSON_VALUE(raw_json, '$.web_offer_price'))`; si falta, precio de lista positivo.
- Control de publicación: `activo` + `web_status` + `web_visible` + `is_published`; un producto no publicado NO puede cotizarse.
- `stock_publicado` = stock del canal web, **no** stock físico del ERP. NULL significa no confirmado, nunca cero.
- `source_sync_at` = última lectura V8. Se interpreta como hora local de Lima al cargar a Supabase.
- Máxima antigüedad de oferta: **48 horas**. Más antigua ⇒ no cotizar ni recomendar.
- Caché en backend: 30 segundos.
- Documentos RAG, stock ERP e historial de ventas NO se recalculan ni replican aquí.

### Seguridad
`arm_channel_offers` usa RLS y solo `service_role` del backend puede leer/actualizar; sin permisos directos para `anon` ni `authenticated`.
Nunca colocar la Service Role Key en el frontend ni enviar credenciales a archivos Git. Los datos de costo de distribuidores no se exportan como precio final.

## Sincronización desde PC020

Ruta del backend: `C:\DESAROLLO\n8n\backend`

Dry run (sin escrituras):
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-web-stech-offers.ps1
```

Aplicar cambios validados (solo `arm_channel_offers`):
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-web-stech-offers.ps1 -Apply
```

El script lee solo `DB_DISTRIBUIDORES` local, nunca escribe en PC005. Recorre filas `WEB_STECH` y solo sincroniza PNs ya aprobados y existentes en `arm_products`. No crea productos nuevos ni modifica precios globales de `arm_products`.

**Importante:** No hay tarea programada todavía; no afirmar sincronización automática hasta configurar monitor/alertas, política de frecuencia y pruebas de caída.

## Arranque QA aislado
```powershell
cd C:\DESAROLLO\n8n\backend
$env:ERP_MODE='supabase'
$env:PORT='3004'
$env:HOST='127.0.0.1'
$env:PERSISTENCE_MODE='memory'
$env:N8N_MODE='noop'
$env:CRM_AUTOMATION_ENABLED='false'
npm start
```

El `.env` existente mantiene `OPENAI_MODEL=gpt-5-mini-2025-08-07`. No editar `.env` productivo.

Pruebas específicas:
```powershell
node --experimental-strip-types --test tests/unit/supabase-erp-catalog.test.ts
npm run build
```

## Estado de primera replicación (2026-11-09)
Cuatro SKUs canónicos, fuente `WEB_STECH`:
- ARMOR-22-256G: lista S/1819, oferta S/1399, stock canal desconocido.
- ARMOR-25TPro-256GB: lista S/3119, oferta S/2399, stock canal desconocido.
- ARMOR-X12Pro: lista S/1039, oferta S/799, stock canal 2.
- ARMOR-X13: oferta S/949 en origen, pero `is_published=false`; precio NO disponible al bot.

`arm_products.price_pen` y `stock_erp` siguen sin rellenarse; el chatbot toma datos comerciales del canal materializado. No se han importado automáticamente las 1173 filas web porque solo hay 4 PNs canónicos aprobados en Supabase. Para ampliar el catálogo se requiere importar identidades verificadas y mantener sus equivalencias, evitando mezclar variantes.

## Limitaciones previas al pase a producción
- La ruta de consulta de pedidos y otros procedimientos SQL no está implementada en el nuevo adaptador comercial.
- No sustituir el backend productivo por `ERP_MODE=supabase` hasta cubrir esos flujos, pruebas de seguridad, disponibilidad y backfill.
- No tratar `stock_publicado=null` como producto sin stock ni como disponibilidad confirmada.
- No usar precios históricos de pruebas, listas o distribuidores como precio ofrecido al cliente.
