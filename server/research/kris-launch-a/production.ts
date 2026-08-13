import type { Request } from "express";
import type { KrisPriceProfile } from "@shared/research/kris-launch-a/contract";
import type { MemberRow } from "../member-auth";
import {
  KrisDatasetUnavailable,
  createKrisCatalogSourceFromEnv,
  type KrisCatalogSource,
} from "./dataset-reader";
import type { KrisCatalogApiDependencies } from "./routes";
import { KrisCatalogService } from "./service";

export type ResolveKrisActiveMember = (
  req: Request,
) => Promise<MemberRow | null> | MemberRow | null;

/**
 * Production dependencies for the private Launch A catalog.
 *
 * The canonical member guard stays in the composition root and is injected as
 * one resolver. The generated artifact is resolved once so its indexed reader
 * and mtime cache are shared across requests; a service is still created per
 * entitled request, with the profile the server resolved rather than a value
 * supplied by the browser.
 */
export function buildKrisCatalogProductionDependencies(
  resolveActiveMember: ResolveKrisActiveMember,
  options: {
    env?: NodeJS.ProcessEnv;
    source?: KrisCatalogSource | null;
  } = {},
): KrisCatalogApiDependencies {
  if (typeof resolveActiveMember !== "function") {
    throw new Error("Kris Launch A production composition requires canonical member auth");
  }

  const env = options.env ?? process.env;
  const source =
    options.source === undefined
      ? createKrisCatalogSourceFromEnv(env)
      : options.source;

  return {
    env,
    authorizeViewer: async (req) => {
      const member = await resolveActiveMember(req);
      if (!member) return null;
      const email = typeof member.email === "string" ? member.email.trim() : "";
      const memberId = typeof member.id === "string" ? member.id.trim() : "";
      if (email === "" || memberId === "") return null;
      return { audience: "member", email, memberId };
    },
    serviceForProfile: (profile: KrisPriceProfile) => {
      if (source === null) {
        throw new KrisDatasetUnavailable("Launch A catalog artifact is unavailable");
      }
      return new KrisCatalogService(source, profile);
    },
  };
}
