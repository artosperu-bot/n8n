# STECH RAG VECTORIAL V38 — AUTORIDAD Y OBSERVABILIDAD

**Estado:** vigente para `feat/stech-backend` desde 2026-08-23.

## Objetivo

Usar embeddings como ruta principal de recuperación documental para producto e institucional, manteniendo la separación de autoridades:

```text
SQL/ERP = precio, stock y verdad dinámica
Product RAG = especificaciones técnicas documentadas
Institutional RAG = políticas, entrega, pagos, ubicación y postventa
LLM = interpretación/redacción; no autoridad factual
```

## Configuración esperada

```env
RAG_MODE=supabase
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
SUPABASE_RAG_RPC=buscar_rag_producto_documents_v38
```

Compatibilidad: el backend promueve automáticamente el valor histórico `buscar_rag_producto_documents_v37` a `buscar_rag_producto_documents_v38` para evitar que una configuración antigua desactive la mejora.

Institutional RAG usa `buscar_rag_institucional_v38`.

## RPC de producto

`public.buscar_rag_producto_documents_v38`

Contrato:

```text
p_query_embedding vector
p_producto_id text
p_secciones text[]
p_match_count integer
p_match_threshold double precision
```

Diferencia clave frente a v37: producto y secciones se filtran dentro de PostgreSQL ANTES del ranking por similitud y del LIMIT.

Flujo:

```text
pregunta
→ text-embedding-3-small
→ producto_id + secciones
→ buscar_rag_producto_documents_v38
→ similarity search
→ chunks relevantes del producto y familia técnica solicitada
```

## RPC institucional

`public.buscar_rag_institucional_v38`

Contrato:

```text
p_query_embedding vector
p_match_count integer
p_match_threshold double precision
p_dominio text
p_categoria text
p_subcategoria text
p_solo_afirmable boolean
```

Categoría y subcategoría se filtran antes del ranking vectorial.

## Observabilidad

El campo `ragSources` del debug/LIVE es evidencia de qué ruta se utilizó.

Ruta vectorial correcta:

```text
SUPABASE_VECTOR_DOCUMENTS:<SECCION>
SUPABASE_VECTOR_INSTITUCIONAL:<categoria>:<subcategoria>
```

Fallback explícito:

```text
SUPABASE_LEXICAL_FALLBACK_VECTOR_EMPTY_DOCUMENTS:<SECCION>
SUPABASE_LEXICAL_FALLBACK_VECTOR_ERROR_DOCUMENTS:<SECCION>
SUPABASE_LEXICAL_FALLBACK_NO_EMBEDDING_PROVIDER_DOCUMENTS:<SECCION>

SUPABASE_LEXICAL_FALLBACK_VECTOR_EMPTY_INSTITUCIONAL:<categoria>:<subcategoria>
SUPABASE_LEXICAL_FALLBACK_VECTOR_ERROR_INSTITUCIONAL:<categoria>:<subcategoria>
SUPABASE_LEXICAL_FALLBACK_NO_EMBEDDING_PROVIDER_INSTITUCIONAL:<categoria>:<subcategoria>
```

Nunca volver a ocultar errores vectoriales con `catch {}`.

## Evidencia atómica

La recuperación no es texto de presentación.

```text
RAW RAG CHUNK
→ EvidenceNormalizer
→ VerifiedFacts
→ GroundedDirectAnswer / motor comercial
→ Writer
```

Hechos normalizados relevantes incluyen, entre otros:

```text
NFC = Sí|No
5G = Sí|No
4G_LTE = Sí|No
VISION_NOCTURNA = Sí|No
CAMARA_NOCTURNA_MP = n MP
CAMARA_TERMICA = Sí|No
RESOLUCION_TERMICA = WxH
BATERIA_MAH = n mAh
CARGA_W = n W
RAM_FISICA
RAM_VIRTUAL
RESISTENCIA_CAIDAS
IP68
IP69K
MIL_STD_810H
```

Para `ATTRIBUTE/CAPABILITY`, si existen hechos atómicos, no usar el chunk completo como respuesta genérica.

## Requisitos técnicos duros

Los siguientes requisitos, cuando aparecen como prioridades explícitas, son filtros de elegibilidad y no simples puntos de ranking:

- NFC;
- 5G;
- visión/cámara nocturna;
- cámara térmica.

Regla:

```text
VERIFIED YES → elegible
UNKNOWN       → no elegible para ese requisito
NO            → no elegible
```

Después del filtro se aplica ranking por los demás criterios y precio cuando corresponda.

## Persistencia

No se modifica la responsabilidad de `ia_contexto` ni `ia_conversaciones`.

`ia_contexto` sigue siendo estado operativo vigente y `ia_conversaciones` evidencia por turno. El RAG es autoridad documental y no reemplaza memoria/estado ni SQL.

## QA esperado

En la siguiente corrida A20 revisar:

1. Las consultas técnicas deben mostrar mayoritariamente `SUPABASE_VECTOR_DOCUMENTS:*`.
2. Un fallback debe indicar explícitamente `VECTOR_EMPTY`, `VECTOR_ERROR` o `NO_EMBEDDING_PROVIDER`.
3. Una pregunta como `¿tiene NFC?` debe responder el hecho puntual y no volcar toda la sección de conectividad.
4. Un requisito como visión nocturna no puede ser compensado por RAM/conectividad de un candidato que no demuestre visión nocturna.
5. Precio/stock deben seguir viniendo de SQL/ERP.

## Verificación técnica de Supabase realizada

- `documents`: 69/69 filas con embedding.
- `rag_institucional`: 71/71 filas con embedding.
- dimensión: `vector(1536)`.
- RPC v38 producto verificada con Armor 22 + sección BATERIA: devolvió únicamente BATERIA, similarity 1.0000 usando un embedding existente como consulta de control.
- RPC v38 institucional verificada con `ubicacion/direccion`: devolvió exactamente esa categoría/subcategoría, similarity 1.0000 usando un embedding existente como consulta de control.

Esto verifica la función SQL y el filtrado vectorial, no sustituye el LIVE conversacional externo.
