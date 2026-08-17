# Arquitectura — STECH Ventas Consultivas

## Propósito

Este documento describe la arquitectura conceptual y las responsabilidades conocidas del agente comercial de STECH / S&T Store. GitHub es control de ingeniería y memoria técnica; no es el runtime.

## Flujo conceptual

`Inbound → normalización → concurrencia/sesión/contexto → intención/routing → producto/catálogo/institucional/pedido → SQL/RAG → decisión comercial → recomendación → capability truth → reducción de estado → persistencia → respuesta final`

## Autoridad por capa

### n8n

Orquestación del turno, reglas determinísticas, routing, integración SQL/RAG/LLM, reducción de estado, persistencia y salida.

### SQL Server / ERP

Autoridad dinámica para precio, stock, disponibilidad, búsqueda de producto y datos operativos de pedidos/clientes.

### Supabase / PostgreSQL

Persistencia conversacional, contexto, sesiones, concurrencia, RAG, capability truth y evidencia/estado QA.

### RAG

Documentación de producto, políticas y evidencia no dinámica. No sustituye SQL para precio o stock.

### LLM

Interpretación y redacción comercial. No es autoridad para precio, stock, disponibilidad garantizada ni capacidades no verificadas.

## Nodos físicos conocidos

Documentar solo responsabilidades demostradas. Los roles no probados deben permanecer como desconocidos.

- `04 Preparar Turno` — preparación del turno y continuidad comercial; ha participado en preservación de refs de comparación y reducción de pending compuesto.
- `04J` — preparación mecánica de acción/turno.
- `06 Resolver Turno y Estado` — resolución/rehidratación general del estado.
- `06B Rehidratar Contexto Comparación` — continuidad de comparación; congelado salvo regresión demostrada.
- `06C Consumir Criterio Pendiente` — consume una respuesta corta como criterio de decisión cuando existe criterio pendiente.
- `09 Ejecutar SQL` — frontera hacia SQL bridge / procedimiento almacenado.
- `10 Normalizar SQL y Producto` — normalización de respuesta SQL e identidad de producto.
- `12 RAG Producto` — evidencia documental del producto.
- `12A Leer Capacidades Producto` — lectura de capability truth.
- `15C Acumular Evidencia Comercial` — acumula evidencia comercial same-product.
- `15D Consolidar Evidencia Base` — consolida evidencia base.
- `16 Redactor Comercial Final` — redacción comercial final.
- `17 Validar y Reducir Estado` — validación/reducción final de estado; writer destructivo confirmado en el root histórico T6.
- `17A` — autoridad canónica de recomendación.
- `17B` — autoridad de capability truth tri-state.
- `21` — autoridad de reservation/availability progression.
- `22C1 Verificar Renew — Pre Persist` — verificación de lease/renew antes de persistir.
- `23 Guardar Conversación` — persistencia de conversación.
- `25 Salida Final` — transporte/output final.
- `QA TRACE — POST DECISION` — observabilidad QA posterior a decisión.

## Principios de arquitectura

### 1. Current intent priority

La intención explícita del turno actual tiene prioridad sobre contexto histórico, pregunta pendiente antigua o N+1 obsoleto. El contexto se conserva para continuidad, no para secuestrar el turno actual.

### 2. Recommendation authority

`17A` decide recomendación. La reselección posterior en `17` fue retirada para evitar múltiples autoridades contradictorias.

### 3. Capability truth

`17B` usa:

- `SUPPORTED`
- `NOT_SUPPORTED`
- `UNKNOWN`

`UNKNOWN` no significa `false` y no puede convertirse en una afirmación negativa al cliente.

### 4. Real-response QA

Un flag interno no equivale a PASS. Por ejemplo, `precio_mostrado=true` no certifica nada si la respuesta persistida al cliente no contiene realmente el precio.

### 5. Concurrencia P0

Contrato cerrado/frozen:

`Acquire → Renew → Persist → Release`

con FIFO, idempotencia, heartbeat de lease, stale fencing, prevención de phantom acquire, control de attempts y recovery. TTL productivo: 120 s.

## Política de cambios

Antes de cambiar comportamiento:

`FAIL → reproducir → first broken boundary → first responsible owner → root exacto → fix general mínimo → regresión fresca → regresión adyacente → cierre`

No se permiten fixes especulativos, parches por frase ni refactors amplios para bugs locales.

## Snapshots y secretos

Los snapshots de workflows deben estar sanitizados. Nunca conservar Authorization headers, API keys, service-role keys, SQL bridge secrets, Cloudflare credentials, OpenAI keys, webhook secrets, cookies/sesiones ni PII de clientes.
