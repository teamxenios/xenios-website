import {
  isTebraPublicConfiguration,
  type TebraPublicConfiguration,
} from "@shared/care/tebra-experience";

export interface TebraCspContribution {
  frameSrc: readonly string[];
  scriptSrc: readonly string[];
}

function emptyContribution(): TebraCspContribution {
  return { frameSrc: [], scriptSrc: [] };
}

function exactOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function exactScriptPathSource(value: string): string | null {
  try {
    const url = new URL(value);
    // CSP host-source expressions can constrain an exact path, but their
    // grammar has no query component. Keep the approved resource path narrow;
    // the configured runtime URL still retains its reviewed query verbatim.
    if (
      url.pathname === "/" ||
      url.pathname.endsWith("/") ||
      /[;,]/u.test(url.pathname)
    ) {
      return null;
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Produces only the origins needed by a validated, ready embed configuration.
 * It does not mutate global headers or broaden any existing CSP directive.
 */
export function buildTebraCspContribution(
  configuration: TebraPublicConfiguration | unknown,
): TebraCspContribution {
  if (!isTebraPublicConfiguration(configuration)) return emptyContribution();

  const scheduling = configuration.scheduling;
  if (scheduling.status !== "ready" || scheduling.mode === "direct_link") {
    return emptyContribution();
  }

  const frameOrigin = exactOrigin(scheduling.url);
  if (!frameOrigin) return emptyContribution();
  if (scheduling.mode === "iframe") {
    return { frameSrc: [frameOrigin], scriptSrc: [] };
  }

  const scriptSource = exactScriptPathSource(scheduling.popupScriptUrl);
  return scriptSource
    ? { frameSrc: [frameOrigin], scriptSrc: [scriptSource] }
    : emptyContribution();
}
