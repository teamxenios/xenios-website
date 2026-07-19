import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AccessState, CartItem, CatalogResponse, CommerceFlags, CommerceLane, Policy, Product } from "@shared/research/types";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// xenios research: client core. All product data comes from the gated server
// APIs; nothing in this bundle contains the catalog. The provider tracks the
// shared-password gate, the MEMBER session (the member's own Supabase JWT,
// verified server-side on every member-authed API), and the cart. Access
// architecture: the shared password unlocks the gateway and application flows
// only; the catalog and member content require the member session, and an
// authenticated member bypasses the shared password.

export type { CartItem, CommerceFlags, CommerceLane, Policy, Product };

export function formatMoney(cents: number | null): string {
  if (cents === null) return "Pricing available after review";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------
async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function postJson<T>(path: string, data: unknown): Promise<{ status: number; body: T | null }> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

export async function fetchPolicies(): Promise<Record<string, Policy> | null> {
  const { status, body } = await getJson<{ policies: Record<string, Policy> }>("/api/research/policies");
  return status === 200 && body ? body.policies : null;
}

export type OrderResult = { ok: boolean; message?: string; orderId?: string; totalCents?: number };
export async function submitOrder(payload: unknown): Promise<OrderResult> {
  const { body } = await postJson<OrderResult>("/api/research/orders", payload);
  return body ?? { ok: false, message: "The order could not be processed. Please try again." };
}

// ---------------------------------------------------------------------------
// Commerce rules (mirror of the server rules; the server remains the enforcer)
// ---------------------------------------------------------------------------
export function canAddToCart(product: Product, commerce: CommerceFlags): boolean {
  const enabled = product.lane === "research" ? commerce.research : commerce.consumer;
  if (!enabled) return false;
  return product.status === "live" || product.status === "professional-only";
}

export function productActionLabel(product: Product, commerce: CommerceFlags): string {
  if (canAddToCart(product, commerce)) {
    return product.lane === "research" ? "Add to research cart" : "Add to bag";
  }
  if (product.status === "coming-soon") return "Join the waitlist";
  if (product.status === "hold") return "View research profile";
  if (product.status === "professional-only") return "Professional access";
  return "Request access";
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export type GateStatus = "checking" | "unconfigured" | "locked" | "open";

export type MemberInfo = {
  firstName: string;
  status: string;
  applicationStatus: string | null;
};

type ResearchContextValue = {
  gate: GateStatus;
  member: MemberInfo | null;
  memberToken: string | null;
  memberChecking: boolean;
  refreshMember: () => Promise<void>;
  signOutMember: () => Promise<void>;
  products: Product[];
  bySlug: Map<string, Product>;
  commerce: CommerceFlags;
  email: string;
  submitPassword: (password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  // cart
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (slug: string) => void;
  setQuantity: (slug: string, quantity: number) => void;
  clearLane: (lane: CommerceLane) => void;
  count: number;
  laneItems: (lane: CommerceLane) => Array<CartItem & { product: Product }>;
};

const ResearchContext = createContext<ResearchContextValue | null>(null);
const STORAGE_KEY = "xenios-research-cart-v1";

export function ResearchProvider({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<GateStatus>("checking");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [memberToken, setMemberToken] = useState<string | null>(null);
  const [memberChecking, setMemberChecking] = useState(true);

  // The member session: the member's own Supabase JWT. Membership itself is
  // verified SERVER-side (/api/research/member/me); the client only mirrors it.
  const refreshMember = useCallback(async () => {
    setMemberChecking(true);
    try {
      const supabase = await getSupabaseBrowser();
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
      if (!token) {
        setMember(null);
        setMemberToken(null);
        return;
      }
      const res = await fetch("/api/research/member/me", {
        headers: { Authorization: "Bearer " + token },
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setMember(body.member as MemberInfo);
        setMemberToken(token);
      } else {
        setMember(null);
        setMemberToken(null);
      }
    } catch {
      setMember(null);
      setMemberToken(null);
    } finally {
      setMemberChecking(false);
    }
  }, []);

  const signOutMember = useCallback(async () => {
    try {
      const supabase = await getSupabaseBrowser();
      await supabase?.auth.signOut();
    } catch {
      // the local state clears regardless
    }
    setMember(null);
    setMemberToken(null);
    setCatalog(null);
  }, []);

  // The catalog is MEMBER content: it loads only with the member token, and
  // the server enforces that (requireMember on /api/research/catalog).
  const loadCatalog = useCallback(async (token: string) => {
    const res = await fetch("/api/research/catalog", {
      headers: { Authorization: "Bearer " + token },
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as CatalogResponse | null;
    if (res.status === 200 && body) setCatalog(body);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { status, body } = await getJson<AccessState>("/api/research/me");
      if (!alive) return;
      if (status === 503 || (body && !body.configured)) {
        setGate("unconfigured");
        setMemberChecking(false);
        return;
      }
      setGate(body?.authed ? "open" : "locked");
      await refreshMember();
    })();
    return () => {
      alive = false;
    };
  }, [refreshMember]);

  // An authenticated member bypasses the shared password, and the catalog
  // follows the member session.
  useEffect(() => {
    if (!member || !memberToken) return;
    setGate("open");
    void loadCatalog(memberToken);
  }, [member, memberToken, loadCatalog]);

  // cart persistence
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const submitPassword = useCallback(
    async (passwordValue: string): Promise<string | null> => {
      const { status, body } = await postJson<{ ok: boolean; message?: string }>("/api/research/access", {
        password: passwordValue,
      });
      if (status === 200 && body?.ok) {
        setGate("open");
        return null;
      }
      return body?.message || "That password is not correct.";
    },
    [],
  );

  const logout = useCallback(async () => {
    await postJson("/api/research/logout", {});
    setCatalog(null);
    setGate("locked");
  }, []);

  const addItem = useCallback((product: Product) => {
    setItems((current) => {
      const existing = current.find((item) => item.slug === product.slug);
      if (existing) {
        return current.map((item) =>
          item.slug === product.slug ? { ...item, quantity: Math.min(item.quantity + 1, 25) } : item,
        );
      }
      return [...current, { slug: product.slug, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((slug: string) => {
    setItems((current) => current.filter((item) => item.slug !== slug));
  }, []);

  const setQuantity = useCallback(
    (slug: string, quantity: number) => {
      if (quantity <= 0) {
        removeItem(slug);
        return;
      }
      setItems((current) => current.map((item) => (item.slug === slug ? { ...item, quantity: Math.min(quantity, 25) } : item)));
    },
    [removeItem],
  );

  const bySlug = useMemo(() => new Map((catalog?.products ?? []).map((product) => [product.slug, product])), [catalog]);

  const clearLane = useCallback(
    (lane: CommerceLane) => {
      setItems((current) => current.filter((item) => bySlug.get(item.slug)?.lane !== lane));
    },
    [bySlug],
  );

  const laneItems = useCallback(
    (lane: CommerceLane) =>
      items
        .map((item) => ({ ...item, product: bySlug.get(item.slug) }))
        .filter((entry): entry is CartItem & { product: Product } => Boolean(entry.product && entry.product.lane === lane)),
    [items, bySlug],
  );

  const value: ResearchContextValue = {
    gate,
    member,
    memberToken,
    memberChecking,
    refreshMember,
    signOutMember,
    products: catalog?.products ?? [],
    bySlug,
    commerce: catalog?.commerce ?? { research: false, consumer: false },
    email: catalog?.email ?? "research@xeniostechnology.com",
    submitPassword,
    logout,
    items,
    addItem,
    removeItem,
    setQuantity,
    clearLane,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    laneItems,
  };

  return <ResearchContext.Provider value={value}>{children}</ResearchContext.Provider>;
}

export function useResearch(): ResearchContextValue {
  const ctx = useContext(ResearchContext);
  if (!ctx) throw new Error("useResearch must be used inside ResearchProvider");
  return ctx;
}

export function byCategory(products: Product[], category: Product["category"]): Product[] {
  return products
    .filter((product) => product.category === category)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
}
