param(
  [switch]$Apply,
  [int]$MaxSourceAgeHours = 48
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Source: PC020 SQL (read-only); target: Supabase materialized channel offers.
# Dry run by default. NEVER copies distributor cost or physical ERP stock into sale stock.
$root = Split-Path -Parent $PSScriptRoot
$settings = @{}
Get-Content (Join-Path $root '.env') | ForEach-Object {
  if ($_ -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    $settings[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}
if (-not $settings['SUPABASE_URL'] -or -not $settings['SUPABASE_SERVICE_ROLE_KEY']) {
  throw 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in backend .env'
}
$api = $settings['SUPABASE_URL'].TrimEnd('/')
$key = $settings['SUPABASE_SERVICE_ROLE_KEY']
$headers = @{ apikey = $key; authorization = "Bearer $key" }
$canonical = @{}
$pageSize = 1000
for ($offset = 0; ; $offset += $pageSize) {
  $url = "$api/rest/v1/arm_products?select=workspace_id,partnumber&limit=$pageSize&offset=$offset"
  $page = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
  foreach ($p in $page) {
    if (-not [string]::IsNullOrWhiteSpace([string]$p.partnumber)) {
      $canonical[([string]$p.partnumber).Trim().ToUpperInvariant()] = $p
    }
  }
  if ($page.Count -lt $pageSize) { break }
}
if (-not $canonical.Count) { throw 'No canonical arm_products found; no writes performed.' }

$query = @'
SELECT p.seller_sku,
       CAST(p.precio_actual AS decimal(12,2)) AS list_price,
       TRY_CONVERT(decimal(12,2),JSON_VALUE(p.raw_json,'$.web_offer_price')) AS offer_price,
       JSON_VALUE(p.raw_json,'$.web_status') AS web_status,
       JSON_VALUE(p.raw_json,'$.web_visible') AS web_visible,
       JSON_VALUE(p.raw_json,'$.web_updated_at') AS web_updated_at,
       p.stock_publicado,p.moneda,p.activo,p.is_published,p.ultima_sync_at
FROM dbo.CHN_PUBLICACION p
JOIN dbo.CHN_CUENTA a ON a.cuenta_canal_id=p.cuenta_canal_id
WHERE a.codigo='WEB_STECH';
'@
$source = @(Invoke-Sqlcmd -ServerInstance 'localhost' -Database 'DB_DISTRIBUIDORES' -Query $query -QueryTimeout 30 -ErrorAction Stop)
$tz = [TimeZoneInfo]::FindSystemTimeZoneById('SA Pacific Standard Time')
$nowUtc = [DateTime]::UtcNow
$payload = New-Object System.Collections.ArrayList
$skipped = New-Object System.Collections.ArrayList

foreach ($p in $source) {
  $seller = [string]$p.seller_sku
  $canonicalKey = $seller.Trim().ToUpperInvariant()
  if (-not $canonical.ContainsKey($canonicalKey)) { continue }
  if ($null -eq $p.ultima_sync_at -or $p.ultima_sync_at -is [DBNull]) {
    [void]$skipped.Add("$seller : missing sync timestamp")
    continue
  }
  $sourceTime = [datetime]::SpecifyKind([datetime]$p.ultima_sync_at,[DateTimeKind]::Unspecified)
  $syncUtc = [TimeZoneInfo]::ConvertTimeToUtc($sourceTime,$tz)
  if ($syncUtc -gt $nowUtc.AddMinutes(5) -or ($nowUtc-$syncUtc).TotalHours -gt $MaxSourceAgeHours) {
    [void]$skipped.Add("$seller : stale sync")
    continue
  }
  if ([string]$p.moneda -ne 'PEN') {
    [void]$skipped.Add("$seller : currency not PEN")
    continue
  }
  $active = ([bool]$p.activo) -and (([string]$p.web_status).ToLowerInvariant() -eq 'si') -and (([string]$p.web_visible).ToLowerInvariant() -eq 'true')
  $published = [bool]$p.is_published
  $offer = if ($null -ne $p.offer_price -and $p.offer_price -isnot [DBNull] -and [decimal]$p.offer_price -gt 0) { [decimal]$p.offer_price } elseif ($null -ne $p.list_price -and $p.list_price -isnot [DBNull] -and [decimal]$p.list_price -gt 0) { [decimal]$p.list_price } else { $null }
  $list = if ($null -ne $p.list_price -and $p.list_price -isnot [DBNull] -and [decimal]$p.list_price -gt 0) { [decimal]$p.list_price } else { $null }
  $stock = if ($null -ne $p.stock_publicado -and $p.stock_publicado -isnot [DBNull] -and [decimal]$p.stock_publicado -ge 0 -and [decimal]$p.stock_publicado -eq [Math]::Truncate([decimal]$p.stock_publicado)) { [int]$p.stock_publicado } else { $null }
  $sourceUpdated = $null
  if ($p.web_updated_at) {
    try { $sourceUpdated = ([DateTimeOffset]::Parse([string]$p.web_updated_at)).UtcDateTime.ToString('o') } catch {}
  }
  $row = @{
    workspace_id = [string]$canonical[$canonicalKey].workspace_id
    partnumber = [string]$canonical[$canonicalKey].partnumber
    channel_code = 'WEB_STECH'
    seller_sku = $seller
    price_pen = $offer
    list_price_pen = $list
    stock_publicado = $stock
    currency = 'PEN'
    active = $active
    is_published = $published
    source_updated_at = $sourceUpdated
    source_sync_at = $syncUtc.ToString('o')
    captured_at = $nowUtc.ToString('o')
    source_table = 'DB_DISTRIBUIDORES.dbo.CHN_PUBLICACION'
  }
  [void]$payload.Add($row)
}

Write-Output "Source WEB_STECH rows=$($source.Count) matched=$($payload.Count) skipped=$($skipped.Count) mode=$(if($Apply){'APPLY'}else{'DRY_RUN'})"
foreach($row in $payload) {
  Write-Output ("SKU={0} offer={1} list={2} published={3} active={4} published_stock={5}" -f $row.seller_sku,$row.price_pen,$row.list_price_pen,$row.is_published,$row.active,$row.stock_publicado)
}
foreach($reason in $skipped) {Write-Output "SKIP $reason"}
if (-not $Apply) { return }
if ($payload.Count -eq 0) { throw 'No qualified materialized offers, aborted.' }

$upsertHeaders = @{
  apikey = $key
  authorization = "Bearer $key"
  Prefer = 'resolution=merge-duplicates,return=representation'
  'Content-Type' = 'application/json; charset=utf-8'
}
$upsertUrl = "$api/rest/v1/arm_channel_offers?on_conflict=workspace_id%2Cchannel_code%2Cpartnumber"
$body = ConvertTo-Json -InputObject @($payload.ToArray()) -Depth 8 -Compress
$written = Invoke-RestMethod -Uri $upsertUrl -Method Post -Headers $upsertHeaders -Body ([Text.Encoding]::UTF8.GetBytes($body))
Write-Output "SUPABASE_UPSERT_OK=$($written.Count)"
