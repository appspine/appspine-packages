param(
  [string] $Image = "postgres:16-alpine"
)

$ErrorActionPreference = "Stop"

if ($Image -eq "latest" -or $Image.EndsWith(":latest")) {
  throw "Postgres image must be pinned to a concrete version."
}

$containerName = "appspine-mcp-idempotency-drill-$([guid]::NewGuid().ToString("N").Substring(0, 12))"
$password = "appspine"

function Invoke-DrillSql {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Sql
  )

  $tempFile = New-TemporaryFile
  try {
    Set-Content -LiteralPath $tempFile.FullName -Value $Sql -Encoding UTF8
    docker cp $tempFile.FullName "${containerName}:/tmp/drill.sql" | Out-Null
    docker exec $containerName psql -U appspine -d appspine -v ON_ERROR_STOP=1 -f /tmp/drill.sql | Out-Null
  }
  finally {
    Remove-Item -LiteralPath $tempFile.FullName -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Scalar {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Sql
  )

  $output = docker exec $containerName psql -U appspine -d appspine -v ON_ERROR_STOP=1 -At -c $Sql
  return ($output | Select-Object -First 1).Trim()
}

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [string] $Expected,
    [Parameter(Mandatory = $true)]
    [string] $Actual
  )

  if ($Actual -ne $Expected) {
    throw "${Name}: expected '${Expected}', got '${Actual}'"
  }

  Write-Host "[ok] $Name"
}

try {
  docker run --rm -d --name $containerName `
    -e POSTGRES_USER=appspine `
    -e POSTGRES_PASSWORD=$password `
    -e POSTGRES_DB=appspine `
    $Image | Out-Null

  $ready = $false
  for ($i = 0; $i -lt 60; $i += 1) {
    docker exec $containerName pg_isready -U appspine -d appspine | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }

  if (-not $ready) {
    throw "Postgres did not become ready."
  }

  Invoke-DrillSql @"
CREATE TABLE mcp_idempotency_records (
  id text PRIMARY KEY,
  api_key_id text NOT NULL,
  tool_name text NOT NULL,
  operation_id text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  lease_expires_at timestamptz NOT NULL,
  result_json jsonb,
  error_json jsonb,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mcp_idempotency_scope_operation_unique
    UNIQUE (api_key_id, tool_name, operation_id)
);

CREATE INDEX mcp_idempotency_status_lease_idx
  ON mcp_idempotency_records (status, lease_expires_at);

CREATE INDEX mcp_idempotency_expires_at_idx
  ON mcp_idempotency_records (expires_at);
"@

  $jobs = 1..2 | ForEach-Object {
    Start-Job -ArgumentList $containerName, $_ -ScriptBlock {
      param($ContainerName, $Index)

      docker exec $ContainerName psql -U appspine -d appspine -v ON_ERROR_STOP=1 -c "
INSERT INTO mcp_idempotency_records (
  id, api_key_id, tool_name, operation_id, request_hash, status, lease_expires_at
) VALUES (
  'concurrent-' || $Index,
  'api-key-a',
  'tools.write',
  'operation-concurrent',
  'hash-a',
  'processing',
  now() + interval '5 minutes'
) ON CONFLICT ON CONSTRAINT mcp_idempotency_scope_operation_unique DO NOTHING;
" | Out-Null
    }
  }

  $jobs | Wait-Job | Out-Null
  foreach ($job in $jobs) {
    Receive-Job $job | Out-Null
    if ($job.State -ne "Completed") {
      throw "Concurrent insert job failed."
    }
  }
  $jobs | Remove-Job | Out-Null

  Assert-Equal `
    -Name "real Postgres concurrent acquire keeps one processing row" `
    -Expected "1" `
    -Actual (Invoke-Scalar "SELECT count(*) FROM mcp_idempotency_records WHERE operation_id = 'operation-concurrent';")

  Invoke-DrillSql @"
INSERT INTO mcp_idempotency_records (
  id, api_key_id, tool_name, operation_id, request_hash, status, lease_expires_at
) VALUES
  ('scope-api', 'api-key-b', 'tools.write', 'operation-concurrent', 'hash-a', 'processing', now() + interval '5 minutes'),
  ('scope-tool', 'api-key-a', 'tools.other', 'operation-concurrent', 'hash-a', 'processing', now() + interval '5 minutes');
"@

  Assert-Equal `
    -Name "operation id is isolated by API key and tool" `
    -Expected "3" `
    -Actual (Invoke-Scalar "SELECT count(*) FROM mcp_idempotency_records WHERE operation_id = 'operation-concurrent';")

  Invoke-DrillSql @"
BEGIN;
INSERT INTO mcp_idempotency_records (
  id, api_key_id, tool_name, operation_id, request_hash, status, lease_expires_at
) VALUES (
  'rollback-row', 'api-key-a', 'tools.write', 'operation-rollback', 'hash-a', 'processing', now() + interval '5 minutes'
);
ROLLBACK;
"@

  Assert-Equal `
    -Name "transaction rollback removes acquired row" `
    -Expected "0" `
    -Actual (Invoke-Scalar "SELECT count(*) FROM mcp_idempotency_records WHERE operation_id = 'operation-rollback';")

  Invoke-DrillSql @"
INSERT INTO mcp_idempotency_records (
  id, api_key_id, tool_name, operation_id, request_hash, status, lease_expires_at
) VALUES (
  'conflict-row', 'api-key-a', 'tools.write', 'operation-conflict', 'hash-a', 'processing', now() + interval '5 minutes'
);
"@

  Assert-Equal `
    -Name "hash conflict is detectable inside the same scope" `
    -Expected "1" `
    -Actual (Invoke-Scalar "SELECT count(*) FROM mcp_idempotency_records WHERE api_key_id = 'api-key-a' AND tool_name = 'tools.write' AND operation_id = 'operation-conflict' AND request_hash <> 'hash-b';")

  Invoke-DrillSql @"
UPDATE mcp_idempotency_records
SET status = 'succeeded',
    result_json = '{"ok": true, "secret": "[redacted]"}'::jsonb,
    completed_at = now(),
    expires_at = now() + interval '1 day'
WHERE api_key_id = 'api-key-a'
  AND tool_name = 'tools.write'
  AND operation_id = 'operation-conflict'
  AND request_hash = 'hash-a'
  AND status = 'processing';
"@

  Assert-Equal `
    -Name "saved result is replayable" `
    -Expected "true" `
    -Actual (Invoke-Scalar "SELECT result_json->>'ok' FROM mcp_idempotency_records WHERE operation_id = 'operation-conflict';")

  Invoke-DrillSql @"
INSERT INTO mcp_idempotency_records (
  id, api_key_id, tool_name, operation_id, request_hash, status, lease_expires_at, expires_at
) VALUES (
  'expired-row', 'api-key-a', 'tools.write', 'operation-expired', 'hash-a', 'succeeded', now(), now() - interval '1 minute'
);

DELETE FROM mcp_idempotency_records
WHERE expires_at IS NOT NULL
  AND expires_at < now();
"@

  Assert-Equal `
    -Name "retention pruning removes expired records" `
    -Expected "0" `
    -Actual (Invoke-Scalar "SELECT count(*) FROM mcp_idempotency_records WHERE operation_id = 'operation-expired';")

  Invoke-DrillSql @"
INSERT INTO mcp_idempotency_records (
  id, api_key_id, tool_name, operation_id, request_hash, status, lease_expires_at
) VALUES (
  'stale-row', 'api-key-a', 'tools.write', 'operation-stale', 'hash-a', 'processing', now() - interval '1 minute'
);

UPDATE mcp_idempotency_records
SET lease_expires_at = now() + interval '5 minutes'
WHERE api_key_id = 'api-key-a'
  AND tool_name = 'tools.write'
  AND operation_id = 'operation-stale'
  AND request_hash = 'hash-a'
  AND status = 'processing'
  AND lease_expires_at < now();
"@

  Assert-Equal `
    -Name "explicit stale lease recovery can reclaim processing row" `
    -Expected "1" `
    -Actual (Invoke-Scalar "SELECT count(*) FROM mcp_idempotency_records WHERE operation_id = 'operation-stale' AND lease_expires_at > now();")
}
finally {
  docker rm -f $containerName | Out-Null
}
