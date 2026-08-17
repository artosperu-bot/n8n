# P3 Security and SQL Bridge Migration Design

Date: 2026-08-17  
Scope: QA design only; no production endpoint, credential, or secret was changed.

## Findings

### CRITICAL — execution inspection can expose authentication material

Full n8n execution data includes HTTP transport objects. Inspecting unrestricted node output can surface request headers, response cookies, and connection internals. This is materially different from the sanitized QA evidence committed to GitHub.

Affected SQL-bridge HTTP nodes:

- `04G Catálogo para Saludo`
- `09 Ejecutar SQL`
- `10B Ejecutar SQL Imágenes`
- `20 Registrar Reserva 24h`

All four currently contain a literal Authorization header and have no n8n credential object assigned.

### HIGH — secret-bearing observability path

The current workflow saves enough execution detail that a privileged execution inspector can retrieve transport-level objects. P3 evidence collection therefore used node allowlists and field selection and never copied raw headers or transport objects into evidence.

### HIGH — tunnel/config operational risk

The four SQL-bridge nodes use the same literal tunnel endpoint rather than an environment/config abstraction. The endpoint is a tunnel-class dependency and is not represented by a named n8n variable or credential.

### Credential separation inventory

- One scoped `supabaseApi` credential exists and is used by native Supabase nodes.
- No accessible `httpHeaderAuth` or `httpBearerAuth` credential exists for the SQL bridge.
- The active and QA draft versions belong to the same n8n workflow; a draft change does not create credential isolation by itself.
- Therefore moving the SQL bridge headers safely requires an operator-created QA credential and a separately governed production credential. The agent did not create either because the secret value is not available through a safe credential interface and rotation was not authorized.

## Safe QA actions completed

- No secret was printed or committed.
- Evidence retrieval used explicit node and field selection.
- A proposed `execution_id` snapshot change was tested, failed at runtime, and was fully rolled back to the known-good atomic persistence body.
- Production remained on its prior active version.

## Target architecture

1. Replace the ephemeral/literal tunnel dependency with a named, stable tunnel or equivalent private ingress.
2. Bind a controlled DNS hostname to the named tunnel.
3. Restrict ingress to the SQL bridge only and retain the existing request authentication contract during the first cutover.
4. Create separate n8n credentials:
   - `STECH SQL Bridge QA` in the QA project/scope;
   - `STECH SQL Bridge PROD` in the production project/scope.
5. Store Authorization only in those credential objects; remove literal Authorization parameters from the four HTTP nodes.
6. Create a non-secret n8n variable such as `SQL_BRIDGE_BASE_URL` per environment and build each node URL from that variable plus a fixed route.
7. Disable or minimize raw successful-execution retention for the SQL-bridge HTTP nodes where operationally acceptable; retain sanitized correlation fields separately.
8. Add a credential-lint and literal-tunnel check to pre-promotion validation.

## QA migration sequence

1. Operator provisions the named QA tunnel and QA credential.
2. Clone the current QA draft or create a reviewed descendant.
3. Replace only the four URL expressions and credential bindings.
4. Run greeting/catalog, product SQL, image SQL, purchase/reservation, timeout, unauthorized, and retry tests.
5. Confirm no Authorization value appears in node parameters or sanitized evidence.
6. Confirm atomic persistence and P0 concurrency gates remain unchanged.
7. Request review before any production credential or endpoint change.

## Production cutover

1. Provision the production named tunnel and production credential independently.
2. Keep the current endpoint available during a defined rollback window.
3. Apply the reviewed four-node configuration change to a production candidate version.
4. Run compact smoke tests using non-destructive requests.
5. Publish only after explicit approval.
6. Monitor error rate, latency, SQL-bridge availability, and reservation failures.

## Rollback

- Republish the previous active workflow version.
- Repoint the stable DNS/tunnel route to the prior bridge service if necessary.
- Keep the old endpoint and credential valid only for the agreed rollback window, then revoke through the operator-controlled credential process.
- Never paste the old secret back into workflow parameters.

## Promotion blocker

Credential migration is a production-readiness blocker until the operator provisions scoped QA/PROD credentials and a stable endpoint. It is not safe to automate from the current authority because creating or rotating the live secret is an irreversible operational action.
