import { createHash } from "node:crypto";
import type { SupplementBrand } from "./contracts";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

const BRAND_HOSTS: Record<SupplementBrand, readonly string[]> = {
  Momentous: ["livemomentous.com", "www.livemomentous.com"],
  "Pure Encapsulations": [
    "pureencapsulationspro.com",
    "www.pureencapsulationspro.com",
  ],
  "Life Extension": ["lifeextension.com", "www.lifeextension.com"],
  NutriDyn: ["nutridyn.com", "www.nutridyn.com"],
};

export function assertOfficialUrl(brand: SupplementBrand, value: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error("Official source URL must use HTTPS");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!BRAND_HOSTS[brand].some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    throw new Error(`Source hostname is not approved for ${brand}`);
  }
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function fetchOfficialText(input: {
  brand: SupplementBrand;
  url: string;
  fetcher: FetchLike;
  accept: string;
  maxRedirects?: number;
}): Promise<{ response: Response; body: string; finalUrl: URL }> {
  let current = assertOfficialUrl(input.brand, input.url);
  const maxRedirects = input.maxRedirects ?? 3;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await input.fetcher(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: input.accept,
        "User-Agent": "XeniosOfficialMediaIngestion/1.0 (+authorized-source-audit)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === maxRedirects) {
        throw new Error(`Official source redirect could not be followed (${response.status})`);
      }
      current = assertOfficialUrl(input.brand, new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      throw new Error(`Official source returned HTTP ${response.status}`);
    }
    return { response, body: await response.text(), finalUrl: current };
  }
  throw new Error("Official source redirect limit exceeded");
}

export function mediaFormatFromUrl(value: string | null): string | null {
  if (!value) return null;
  let pathname: string;
  try {
    pathname = new URL(value, "https://official-source.invalid").pathname.toLowerCase();
  } catch {
    return null;
  }
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return null;
}
