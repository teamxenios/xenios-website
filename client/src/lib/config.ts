export interface PublicConfig {
  metaPixelId: string | null;
  turnstileSiteKey: string | null;
  calendlyUrl: string;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

const FALLBACK: PublicConfig = {
  metaPixelId: null,
  turnstileSiteKey: null,
  calendlyUrl: "https://calendly.com/samuel-xeniostechnology/30min",
  supabaseUrl: null,
  supabaseAnonKey: null,
};

let cached: Promise<PublicConfig> | null = null;

export function getConfig(): Promise<PublicConfig> {
  if (!cached) {
    cached = fetch("/api/config")
      .then((r) => (r.ok ? r.json() : FALLBACK))
      .then((c) => ({ ...FALLBACK, ...c }))
      .catch(() => FALLBACK);
  }
  return cached;
}
