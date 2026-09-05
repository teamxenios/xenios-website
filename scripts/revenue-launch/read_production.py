"""Read-only, allowlisted launch evidence. Never emits credentials or people.

Render credentials are used only for the Render API; Supabase credentials are
used only for the pinned project host. All network operations are GET requests.
Configuration on the service is not proof of the running process environment.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

SERVICE = "srv-d8s9vej7uimc7384dfcg"
PROJECT = "https://yvzeduaxbwgcwllhywff.supabase.co"
TABLE_FIELDS = {
    "research_products": "id,sku,canonical_name,display_name,slug,lane,product_classification,admin_status,active_state,visibility_state,availability,commerce_approval,quality_document_state,updated_at",
    "research_product_variants": "id,product_id,sku,label,strength,size,format,presentation,shipping_class,member_eligible,status,active,updated_at",
    "research_product_prices": "id,product_id,variant_id,audience,amount_cents,currency,effective_at,expires_at,status,version",
}


def get_json(url, headers):
    try:
        with urlopen(Request(url, headers=headers, method="GET"), timeout=25) as response:
            return {"ok": True, "status": response.status, "data": json.load(response)}
    except HTTPError as exc:
        return {"ok": False, "status": exc.code}
    except (URLError, TimeoutError, ValueError):
        return {"ok": False, "status": "unavailable"}


def read_production():
    evidence = {"schemaVersion": 1, "observedAt": datetime.now(timezone.utc).isoformat(),
                "serviceId": SERVICE, "projectHost": PROJECT, "productionMutated": False,
                "runtimeEnvironmentVerified": False, "migrationLedgerVerified": False}
    render_key = os.environ.get("RENDER_API_KEY")
    if not render_key:
        return {**evidence, "blocker": "render_read_credential_unavailable"}
    headers = {"Authorization": "Bearer " + render_key, "Accept": "application/json"}
    base = "https://api.render.com/v1/services/" + SERVICE
    service = get_json(base, headers)
    if service["ok"]:
        value = service["data"]
        evidence["service"] = {key: value.get(key) for key in ("id", "name", "branch", "autoDeploy", "suspended")}
    else:
        evidence["serviceRead"] = service
    deploy = get_json(base + "/deploys?limit=1", headers)
    if deploy["ok"] and deploy["data"]:
        value = deploy["data"][0]["deploy"]
        evidence["latestDeploy"] = {key: value.get(key) for key in ("id", "status", "finishedAt")}
        evidence["latestDeploy"]["commitSha"] = value.get("commit", {}).get("id")
    else:
        evidence["deployRead"] = {key: value for key, value in deploy.items() if key != "data"}
    environment = {}
    cursor = None
    for _ in range(10):
        query = {"limit": 100}
        if cursor:
            query["cursor"] = cursor
        result = get_json(base + "/env-vars?" + urlencode(query), headers)
        if not result["ok"]:
            evidence["environmentRead"] = result
            return evidence
        rows = result["data"]
        for row in rows:
            value = row["envVar"]
            environment[value["key"]] = value["value"]
        if len(rows) < 100:
            break
        cursor = rows[-1].get("cursor")
        if not cursor:
            return {**evidence, "blocker": "environment_pagination_unresolved"}
    else:
        return {**evidence, "blocker": "environment_pagination_limit"}
    # Names alone may be diagnostic; values only for a strict boolean vocabulary.
    evidence["serviceEnvironmentKeys"] = sorted(environment)
    evidence["booleanConfiguration"] = {
        key: value.lower() for key, value in environment.items()
        if (key.endswith("_ENABLED") or key.endswith("_DISABLED"))
        and value.lower() in ("true", "false", "0", "1")}
    evidence["credentialPresence"] = {key: bool(environment.get(key)) for key in
        ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "SUPABASE_DB_URL")}
    if environment.get("SUPABASE_URL", "").rstrip("/") != PROJECT:
        return {**evidence, "blocker": "supabase_project_not_verified"}
    key = environment.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        return {**evidence, "blocker": "canonical_read_credential_unavailable"}
    supabase_headers = {"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"}
    tables = {}
    for table, fields in TABLE_FIELDS.items():
        records = []
        for offset in range(0, 10000, 1000):
            result = get_json(PROJECT + "/rest/v1/" + table + "?" + urlencode({
                "select": fields, "order": fields.split(",")[0], "offset": offset, "limit": 1000}), supabase_headers)
            if not result["ok"]:
                tables[table] = result
                break
            records.extend(result["data"])
            if len(result["data"]) < 1000:
                tables[table] = {"ok": True, "rowCount": len(records), "rows": records}
                break
        else:
            tables[table] = {"ok": False, "status": "row_limit_exceeded"}
    evidence["tables"] = tables
    # Supplier tables intentionally revoke all direct reads. Use the existing
    # canonical read RPC with service_role EXECUTE, never bypass that boundary.
    # GET runs the function in PostgREST's read-only transaction.
    confirmations = get_json(PROJECT + "/rest/v1/rpc/research_early_access_live_supplier_confirmations?" +
                             urlencode({"p_now": evidence["observedAt"]}), supabase_headers)
    if confirmations["ok"] and isinstance(confirmations["data"], list):
        safe_keys = ("confirmationId", "productId", "variantId", "sku", "strength", "presentation",
                     "maxQuantity", "documentationState", "confirmedAt", "expiresAt", "status")
        evidence["liveSupplierConfirmations"] = {"ok": True, "count": len(confirmations["data"]),
            "rows": [{field: record.get(field) for field in safe_keys} for record in confirmations["data"]]}
    else:
        evidence["liveSupplierConfirmations"] = {key: value for key, value in confirmations.items() if key != "data"}
    return evidence


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = read_production()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**{key: value for key, value in result.items() if key != "tables"},
                      "tables": {key: {k: v for k, v in value.items() if k != "rows"}
                                 for key, value in result.get("tables", {}).items()}}))
