# CRM Automation Video — SQL Server Contract

**Fecha:** 2026-08-27  
**Estado:** SQL Server agregado manualmente; integración backend/CRM pendiente  
**Base de datos:** `TiendaXYZ`  
**Objetivo:** usar videos asociados a productos en automatizaciones comerciales de WhatsApp, siguiendo el mismo modelo de autoridad que `ProductoImagenes`.

## 1. Decisión de diseño

Los videos se relacionan **únicamente mediante el ID interno del producto**:

```text
Productos.id
   ├── ProductoImagenes.producto_id
   └── ProductoVideos.producto_id
```

No se duplica `part_number`, `sku`, `producto_codigo` ni `producto_rag_id` dentro de `ProductoVideos`.

La tabla `Productos` sigue siendo la autoridad para resolver identificadores externos al `id` interno.

Ejemplos actuales:

| Productos.id | producto_codigo | producto_rag_id | part_number | producto |
|---:|---|---|---|---|
| 47 | P000047 | P-ARMOR-X12Pro | ARMOR-X12Pro | Ulefone Armor X12 Pro |
| 48 | P000048 | P-ARMOR-X13 | ARMOR-X13 | Ulefone Armor X13 |
| 49 | P000049 | P-ARMOR-22-256G | ARMOR-22-256G | Ulefone Armor 22 256GB |
| 50 | P000050 | P-ARMOR-25TPro-256GB | ARMOR-25TPro-256GB | Ulefone Armor 25T Pro 256GB |

## 2. Tabla `dbo.ProductoVideos`

La estructura replica intencionalmente el patrón de `dbo.ProductoImagenes`:

```sql
USE TiendaXYZ;
GO

CREATE TABLE dbo.ProductoVideos
(
    id              INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_ProductoVideos PRIMARY KEY,

    producto_id     INT NOT NULL,

    tipo_video      VARCHAR(100) NOT NULL,

    url_video       NVARCHAR(2048) NOT NULL,

    orden           INT NOT NULL
        CONSTRAINT DF_ProductoVideos_orden DEFAULT (1),

    es_principal    BIT NOT NULL
        CONSTRAINT DF_ProductoVideos_es_principal DEFAULT (0),

    activo          BIT NOT NULL
        CONSTRAINT DF_ProductoVideos_activo DEFAULT (1),

    fecha_creacion  DATETIME2(0) NOT NULL
        CONSTRAINT DF_ProductoVideos_fecha_creacion
        DEFAULT (SYSDATETIME()),

    CONSTRAINT FK_ProductoVideos_Productos
        FOREIGN KEY (producto_id)
        REFERENCES dbo.Productos(id)
);
GO
```

Índices recomendados:

```sql
CREATE INDEX IX_ProductoVideos_producto_id
ON dbo.ProductoVideos
(
    producto_id,
    activo,
    orden
);
GO

CREATE UNIQUE INDEX UX_ProductoVideos_producto_url
ON dbo.ProductoVideos
(
    producto_id,
    url_video
);
GO
```

## 3. Formato de `url_video`

SQL Server **no almacena el binario del video**. Guarda una URL pública HTTPS al archivo.

Formato preferido para automatizaciones:

```text
https://www.s-tech.com.pe/storage/videos/item/<archivo>.mp4
```

Requisitos recomendados:

- HTTPS público.
- Preferentemente archivo directo `.mp4`.
- MIME esperado: `video/mp4`.
- No usar una página de YouTube como sustituto de un archivo de video para el envío automático por WhatsApp.
- El backend podrá normalizar formatos no compatibles en una fase posterior si fuese necesario.

## 4. Tipos de video

`tipo_video` conserva la misma filosofía semántica de `tipo_imagen`.

Valores iniciales sugeridos:

```text
caracteristicas_generales
resistencia_certificaciones
camara
procesador_ram
accesorios
pantalla
bateria
demostracion
```

No es necesario imponer estos valores como `CHECK` en esta primera etapa; permiten evolucionar el catálogo sin una migración por cada nueva categoría multimedia.

## 5. Procedure oficial de consulta

El procedure debe permitir que el backend llegue con cualquiera de los identificadores que ya usa el sistema, pero **siempre resolver primero `Productos.id`** y consultar `ProductoVideos.producto_id`.

```sql
USE TiendaXYZ;
GO

CREATE OR ALTER PROCEDURE dbo.sp_BuscarVideosProductoVenta
    @producto_id      INT = NULL,
    @producto_codigo  VARCHAR(100) = NULL,
    @producto_rag_id  VARCHAR(150) = NULL,
    @part_number      VARCHAR(150) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @id INT;

    SELECT TOP (1)
        @id = P.id
    FROM dbo.Productos AS P
    WHERE
        (@producto_id IS NOT NULL
         AND P.id = @producto_id)

        OR

        (@producto_codigo IS NOT NULL
         AND P.producto_codigo = @producto_codigo)

        OR

        (@producto_rag_id IS NOT NULL
         AND P.producto_rag_id = @producto_rag_id)

        OR

        (@part_number IS NOT NULL
         AND P.part_number = @part_number)
    ORDER BY
        CASE
            WHEN @producto_id IS NOT NULL
                 AND P.id = @producto_id THEN 1

            WHEN @producto_codigo IS NOT NULL
                 AND P.producto_codigo = @producto_codigo THEN 2

            WHEN @producto_rag_id IS NOT NULL
                 AND P.producto_rag_id = @producto_rag_id THEN 3

            WHEN @part_number IS NOT NULL
                 AND P.part_number = @part_number THEN 4

            ELSE 99
        END;

    IF @id IS NULL
    BEGIN
        SELECT
            CAST(NULL AS INT) AS id,
            CAST(NULL AS INT) AS producto_id,
            CAST(NULL AS VARCHAR(100)) AS tipo_video,
            CAST(NULL AS NVARCHAR(2048)) AS url_video,
            CAST(NULL AS INT) AS orden,
            CAST(NULL AS BIT) AS es_principal,
            CAST(NULL AS BIT) AS activo,
            CAST(NULL AS DATETIME2) AS fecha_creacion
        WHERE 1 = 0;

        RETURN;
    END;

    SELECT
        V.id,
        V.producto_id,
        V.tipo_video,
        V.url_video,
        V.orden,
        V.es_principal,
        V.activo,
        V.fecha_creacion
    FROM dbo.ProductoVideos AS V
    WHERE V.producto_id = @id
      AND V.activo = 1
      AND NULLIF(LTRIM(RTRIM(V.url_video)), '') IS NOT NULL
    ORDER BY
        V.es_principal DESC,
        V.orden ASC,
        V.id ASC;
END;
GO
```

## 6. Ejemplos de uso

Armor 22 por ID interno:

```sql
EXEC dbo.sp_BuscarVideosProductoVenta
    @producto_id = 49;
```

Por `producto_codigo`:

```sql
EXEC dbo.sp_BuscarVideosProductoVenta
    @producto_codigo = 'P000049';
```

Por Part Number:

```sql
EXEC dbo.sp_BuscarVideosProductoVenta
    @part_number = 'ARMOR-22-256G';
```

Por identificador RAG:

```sql
EXEC dbo.sp_BuscarVideosProductoVenta
    @producto_rag_id = 'P-ARMOR-22-256G';
```

En todos los casos la relación final es:

```sql
ProductoVideos.producto_id = Productos.id
```

## 7. Orden de selección

El resultado oficial del procedure se ordena así:

1. `es_principal = 1` primero.
2. `orden ASC`.
3. `id ASC` como desempate estable.

Esto permite al backend trabajar tanto con un único video principal como con una lista ordenada de videos.

## 8. Ejemplo de carga

```sql
INSERT INTO dbo.ProductoVideos
(
    producto_id,
    tipo_video,
    url_video,
    orden,
    es_principal,
    activo
)
VALUES
(
    49,
    'caracteristicas_generales',
    'https://www.s-tech.com.pe/storage/videos/item/armor22-general.mp4',
    1,
    1,
    1
);
```

Segundo video del mismo producto:

```sql
INSERT INTO dbo.ProductoVideos
(
    producto_id,
    tipo_video,
    url_video,
    orden,
    es_principal,
    activo
)
VALUES
(
    49,
    'resistencia_certificaciones',
    'https://www.s-tech.com.pe/storage/videos/item/armor22-resistencia.mp4',
    2,
    0,
    1
);
```

Consulta directa de validación:

```sql
SELECT
    id,
    producto_id,
    tipo_video,
    url_video,
    orden,
    es_principal,
    activo,
    fecha_creacion
FROM dbo.ProductoVideos
WHERE producto_id = 49
ORDER BY es_principal DESC, orden ASC, id ASC;
```

## 9. Futuro contrato con automatizaciones CRM

Los nuevos tipos de acción previstos son:

```text
SEND_VIDEO_PRODUCT_AUTO
SEND_VIDEO_CUSTOM_URL
```

Presentación esperada en UI:

```text
Solo texto
Imagen del producto + texto
Imagen personalizada + texto
Video del producto + texto
Video personalizado + texto
```

### `SEND_VIDEO_PRODUCT_AUTO`

Flujo previsto:

```text
Conversación identifica producto
        ↓
se obtiene producto_id / producto_codigo / producto_rag_id / part_number
        ↓
backend llama dbo.sp_BuscarVideosProductoVenta
        ↓
SQL Server resuelve Productos.id
        ↓
ProductoVideos por producto_id
        ↓
URLs activas ordenadas
        ↓
snapshot en job de automatización
        ↓
WhatsApp Cloud API
        ↓
VIDEO + TEXTO
```

La selección debe congelarse cuando el job se programe, igual que el contrato actual de imágenes. Cambios posteriores en `ProductoVideos` solo afectan jobs futuros.

## 10. Persistencia en Supabase

Supabase **no debe duplicar el archivo MP4**.

Solo debe persistir el snapshot necesario para ejecutar/auditar el job, por ejemplo:

```text
media_url
media_urls_snapshot
media_type
media_product_id
media_source = SQL_BRIDGE
```

Para video, `media_type` podrá contener `tipo_video`.

## 11. Evolución futura: video contextual

La tabla permite que más adelante la IA seleccione el video según la conversación y no solamente el principal.

Ejemplo:

```text
Cliente: "¿Aguanta golpes y agua?"
Producto: Armor 22
producto_id: 49
preferencia multimedia: resistencia_certificaciones
```

El motor comercial podría priorizar:

```text
tipo_video = resistencia_certificaciones
```

Esto queda fuera de la primera implementación de envío automático. La primera versión puede utilizar el video principal y/o todos los videos activos ordenados.

## 12. Estado de implementación

A fecha de este documento:

- `dbo.ProductoVideos`: agregado manualmente en SQL Server por el operador.
- `dbo.sp_BuscarVideosProductoVenta`: agregado manualmente en SQL Server por el operador.
- Relación oficial: `ProductoVideos.producto_id -> Productos.id`.
- Backend todavía no consume este procedure para automatizaciones de video.
- Supabase todavía no extiende el contrato de media específicamente para acciones de video.
- Frontend todavía no ofrece `Video del producto + texto` ni `Video personalizado + texto`.
- La implementación de video se realizará como fase separada después del Dashboard V2.
