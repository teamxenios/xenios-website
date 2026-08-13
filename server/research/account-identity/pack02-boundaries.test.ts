import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Pack 02 isolation and single-system boundaries", () => {
  it("does not mount the candidate routes or UI", () => {
    expect(read("server/index.ts")).not.toContain("registerAccountIdentityApi");
    expect(read("client/src/research/section.tsx")).not.toContain("OrganizationDashboard");
    expect(read("client/src/research/section.tsx")).not.toContain("AccountSignIn");
  });

  it("keeps the database artifact outside managed migrations and contains no credential storage", () => {
    const sql = read("supabase/pack02-candidates/20260812_research_account_organizations.sql");
    expect(sql).toContain("PACK 02 CANDIDATE ONLY");
    expect(sql).toContain("references auth.users(id)");
    expect(sql).toContain("research_early_access_*");
    expect(sql).toContain("order_id uuid primary key references public.research_orders(id)");
    expect(sql).not.toMatch(/create table if not exists public\.research_organization_orders\b/i);
    expect(sql).not.toMatch(/\bpassword\s+(text|varchar|bytea)/i);
    expect(sql).not.toMatch(/\bpassword_hash\b/i);
    expect(sql).not.toMatch(/\bcredential_hash\b/i);
  });

  it("keeps organization order ownership as metadata over the canonical order system", () => {
    const sql = read("supabase/pack02-candidates/20260812_research_account_organizations.sql");
    expect(sql).toContain("research_organization_order_ownership");
    expect(sql).toContain("ownership_basis in ('organization_checkout','verified_customer_claim')");
    expect(sql).toContain("order ownership evidence does not match organization");
    expect(sql).toContain("order ownership actor is not an active organization user");
    expect(sql).toContain("organization order ownership is immutable");
    expect(sql).not.toMatch(/\b(subtotal_cents|captured_amount_cents|payment_reference)\b/);
    expect(sql).toContain("unique (organization_id, source_system, source_order_id)");
    expect(sql).toContain("canonical order is not owned by request organization");
    expect(sql).toContain("request-again actor lacks organization buyer access");
  });

  it("seeds the Roman Digital profile with the superseding canonical email", () => {
    const sql = read("supabase/pack02-candidates/20260812_research_account_organizations.sql");
    expect(sql).toContain("'roman-digital','Roman Digital','Roman Digital'");
    expect(sql).toContain("'info@romanhealthcollective.com'");
    expect(sql).not.toContain("'k@romandigital.io'");
  });

  it("records the founder quantity 1 through 50 decision without creating a Pack 02 cart or order authority", () => {
    const service = read("server/research/account-identity/service.ts");
    const contract = read("shared/research/account-identity.ts");
    const dependency = read("docs/pack02-quantity-1-50-dependency.md");
    expect(service).toContain("NORMAL_ORDER_QUANTITY_MAX = 50");
    expect(service).toContain("superseded_quantity_only_review");
    expect(contract).toContain("Normal founder-approved range is 1..50");
    expect(dependency).toContain("Quantity alone never requires manual review");
    expect(dependency).toContain("5e9ac687d95841529d75deb2d1d580d91380aebd");
    expect(dependency).toContain("0a8b38e62bdf58c9d6646a7cb830309fd2fe6d68");
    expect(service).not.toMatch(/createCart|createCheckout|insertOrder/);
  });

  it("keeps the Kris lookup an explicit read-only audit and rejects the synthetic fixture as identity evidence", () => {
    const audit = read("supabase/pack02-candidates/inspect_kris_identity_read_only.sql");
    const notes = read("docs/pack02-kris-identity-audit.md");
    expect(audit).toContain("begin isolation level repeatable read read only");
    expect(audit).toContain("from auth.users");
    expect(audit).toContain("from public.research_members");
    expect(audit).toContain("from public.research_applications");
    expect(audit).toContain("from public.research_early_access_customers");
    expect(audit).not.toMatch(/\b(insert|update|delete|create user|invite_user)\b/i);
    expect(notes).toContain("authoritative identity not found in the available local evidence");
    expect(notes).toContain("synthetic `Kris Lopez` unit-test fixture");
    expect(notes).toContain("nothing in the supplied evidence proves that user is Kris");
  });

  it("prepares exact existing-UID and secure-invite activation without a second auth path", () => {
    const activation = read("server/research/account-identity/buyer-activation.ts");
    const adapter = read("server/research/account-identity/buyer-activation-supabase.ts");
    const sql = read("supabase/pack02-candidates/20260813_research_buyer_account_activation.sql");
    expect(activation).toContain('path: z.literal("existing_auth")');
    expect(activation).toContain('path: z.literal("new_secure_invite")');
    expect(activation).toContain("findAuthUserById");
    expect(activation).toContain("inviteAuthUser");
    expect(activation).toContain('/research/reset-password');
    expect(activation).not.toMatch(/\bpassword\s*:/i);
    expect(activation).not.toMatch(/createAuth|signUp|createUser/);
    expect(adapter).toContain("admin.auth.admin.inviteUserByEmail");
    expect(adapter).toContain("anon.auth.resetPasswordForEmail");
    expect(adapter).toContain('type: "invite"');
    expect(adapter).toContain("pendingInviteDelivery.deliver");
    expect(adapter).toContain('admin as any).rpc("research_bind_active_buyer_account"');
    expect(sql).toContain("insert into public.research_members");
    expect(sql).toContain("insert into public.research_account_binding_events");
    expect(sql).toContain("'existing_invite_resent'");
    expect(sql).not.toMatch(/insert\s+into\s+auth\.users/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.research_orders/i);
  });

  it("pins the existing mounted member journey and its active-member boundary", () => {
    const section = read("client/src/research/section.tsx");
    const catalogRoutes = read("server/research/catalog/member-catalog-routes.ts");
    const memberAuth = read("server/research/member-auth.ts");
    for (const route of [
      "/research/sign-in",
      "/research/reset-password",
      "/research/member/products",
      "/research/member/cart",
      "/research/member/checkout",
      "/research/member/orders",
      "/research/member/orders/:id",
    ]) {
      expect(section).toContain(route);
    }
    expect(catalogRoutes).toContain('"/api/research/member/products"');
    expect(catalogRoutes).toContain("requireActiveMember");
    expect(memberAuth).toContain("getSupabaseAnon().auth.getUser(jwt)");
    expect(memberAuth).toContain('if (status === "active")');
  });
});
