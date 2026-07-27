// One-time production command boundary. DO NOT run during branch validation.
// Website 2 may run it only after Website 6 accepts the exact release SHA and
// Website 2 verifies account continuity for the existing auth.users UUID.

import { createClient } from "@supabase/supabase-js";

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "XENIOS_VERIFIED_ADMIN_AUTH_USER_ID",
  "XENIOS_ADMIN_ASSIGNMENT_IDEMPOTENCY_KEY",
  "XENIOS_WEBSITE6_ACCEPTED_SHA",
  "XENIOS_WEBSITE2_ACCOUNT_CONTINUITY",
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is required`);
  }
}

if (
  process.env.XENIOS_WEBSITE2_ACCOUNT_CONTINUITY?.trim().toLowerCase() !==
  "verified"
) {
  throw new Error(
    "Website 2 account-continuity precheck must be explicitly verified",
  );
}

const verifiedUserId = process.env.XENIOS_VERIFIED_ADMIN_AUTH_USER_ID.trim();
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    verifiedUserId,
  )
) {
  throw new Error("XENIOS_VERIFIED_ADMIN_AUTH_USER_ID must be an exact UUID");
}

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data, error } = await client.rpc(
  "research_admin_assign_initial_super_admin",
  {
    p_verified_auth_user_id: verifiedUserId,
    p_reason: `Account continuity verified for Website 6 accepted SHA ${process.env.XENIOS_WEBSITE6_ACCEPTED_SHA.trim()}`,
    p_idempotency_key:
      process.env.XENIOS_ADMIN_ASSIGNMENT_IDEMPOTENCY_KEY.trim(),
  },
);

if (error) throw new Error(`initial super_admin assignment failed: ${error.code}`);
if (!data || data.role !== "super_admin") {
  throw new Error("initial super_admin assignment returned an invalid result");
}

console.log(
  JSON.stringify({
    ok: true,
    role: "super_admin",
    assignmentCreatedOrConfirmed: true,
  }),
);
