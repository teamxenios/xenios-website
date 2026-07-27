import { randomBytes } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { CartProductSelection } from "@shared/research/cart-product-selection";
import type {
  PersistentCartPort,
  PersistentCartResult,
} from "@shared/research/persistent-cart";
import type { MemberRow } from "../member-auth";

const COOKIE_NAME = "xr_cart";
const CART_TTL_DAYS = 30;

type MemberGuard = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;

export interface CartSelectionResolver {
  resolveMemberSelection(input: {
    member: MemberRow;
    productId?: string;
    slug?: string;
    variantId: string;
  }): Promise<CartProductSelection | null>;
  resolveAnonymousSelection(input: {
    productId?: string;
    slug?: string;
    variantId: string;
  }): Promise<CartProductSelection | null>;
}

export type PersistentCartRouteDependencies = {
  carts: PersistentCartPort;
  selections: CartSelectionResolver;
  requireActiveMember: MemberGuard;
  now(): Date;
  randomSecret?(): string;
};

const identityFields = {
  productId: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(200).optional(),
  variantId: z.string().uuid(),
};

const putInput = z
  .object({
    ...identityFields,
    cartId: z.string().uuid().optional(),
    expectedCartVersion: z.number().int().positive().nullable(),
    expectedItemVersion: z.number().int().positive().nullable(),
    quantity: z.number().int().min(1).max(1000),
    idempotencyKey: z.string().trim().min(16).max(200),
  })
  .refine((value) => Boolean(value.productId || value.slug), {
    message: "productId or slug is required",
  });

const removeInput = z.object({
  cartId: z.string().uuid(),
  itemId: z.string().uuid(),
  expectedCartVersion: z.number().int().positive(),
  expectedItemVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(16).max(200),
});

function memberFrom(req: Request): MemberRow | null {
  return (
    (req as Request & { researchMember?: MemberRow }).researchMember ?? null
  );
}

function anonymousSecret(req: Request): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const entry of cookie.split(";")) {
    const [name, ...value] = entry.trim().split("=");
    if (name === COOKIE_NAME) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function setAnonymousSecret(res: Response, secret: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(secret)}; Path=/research; HttpOnly; SameSite=Lax; Max-Age=${CART_TTL_DAYS * 86400}${secure}`,
  );
}

function privateHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
}

function statusFor(result: PersistentCartResult): number {
  if (result.ok) return 200;
  switch (result.code) {
    case "invalid_input":
      return 400;
    case "unauthorized":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
    case "selection_stale":
    case "quantity_limit":
    case "expired":
    case "already_claimed":
      return 409;
    default:
      return 503;
  }
}

function send(res: Response, result: PersistentCartResult): void {
  res.status(statusFor(result)).json(result);
}

function expiresAt(now: Date): string {
  return new Date(now.getTime() + CART_TTL_DAYS * 86400 * 1000).toISOString();
}

function randomSecret(): string {
  return randomBytes(48).toString("base64url");
}

export function registerPersistentCartApi(
  app: Express,
  dependencies: PersistentCartRouteDependencies,
): void {
  app.get(
    "/api/research/member/cart",
    privateHeaders,
    dependencies.requireActiveMember,
    async (req, res) => {
      const member = memberFrom(req);
      if (!member) {
        res.status(403).json({ ok: false, code: "unauthorized" });
        return;
      }
      send(res, await dependencies.carts.getMemberCart(member.id));
    },
  );

  app.put(
    "/api/research/member/cart/items",
    privateHeaders,
    dependencies.requireActiveMember,
    async (req, res) => {
      const member = memberFrom(req);
      const parsed = putInput.safeParse(req.body);
      if (!member || !parsed.success) {
        res
          .status(member ? 400 : 403)
          .json({ ok: false, code: member ? "invalid_input" : "unauthorized" });
        return;
      }
      const selection = await dependencies.selections.resolveMemberSelection({
        member,
        productId: parsed.data.productId,
        slug: parsed.data.slug,
        variantId: parsed.data.variantId,
      });
      if (!selection) {
        res.status(409).json({ ok: false, code: "selection_stale" });
        return;
      }
      send(
        res,
        await dependencies.carts.putMemberItem(member.id, {
          cartId: parsed.data.cartId,
          expectedCartVersion: parsed.data.expectedCartVersion,
          expectedItemVersion: parsed.data.expectedItemVersion,
          quantity: parsed.data.quantity,
          selection,
          idempotencyKey: parsed.data.idempotencyKey,
          expiresAt: expiresAt(dependencies.now()),
        }),
      );
    },
  );

  app.delete(
    "/api/research/member/cart/items",
    privateHeaders,
    dependencies.requireActiveMember,
    async (req, res) => {
      const member = memberFrom(req);
      const parsed = removeInput.safeParse(req.body);
      if (!member || !parsed.success) {
        res
          .status(member ? 400 : 403)
          .json({ ok: false, code: member ? "invalid_input" : "unauthorized" });
        return;
      }
      send(
        res,
        await dependencies.carts.removeMemberItem(member.id, parsed.data),
      );
    },
  );

  app.get(
    "/api/research/anonymous/cart",
    privateHeaders,
    async (req, res) => {
      const secret = anonymousSecret(req);
      if (!secret) {
        res.status(404).json({ ok: false, code: "not_found" });
        return;
      }
      send(res, await dependencies.carts.getAnonymousCart(secret));
    },
  );

  app.put(
    "/api/research/anonymous/cart/items",
    privateHeaders,
    async (req, res) => {
      const parsed = putInput.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, code: "invalid_input" });
        return;
      }
      const selection =
        await dependencies.selections.resolveAnonymousSelection({
          productId: parsed.data.productId,
          slug: parsed.data.slug,
          variantId: parsed.data.variantId,
        });
      if (!selection) {
        res.status(409).json({ ok: false, code: "selection_stale" });
        return;
      }
      let secret = anonymousSecret(req);
      if (!secret) {
        secret = (dependencies.randomSecret ?? randomSecret)();
        setAnonymousSecret(res, secret);
      }
      send(
        res,
        await dependencies.carts.putAnonymousItem(secret, {
          cartId: parsed.data.cartId,
          expectedCartVersion: parsed.data.expectedCartVersion,
          expectedItemVersion: parsed.data.expectedItemVersion,
          quantity: parsed.data.quantity,
          selection,
          idempotencyKey: parsed.data.idempotencyKey,
          expiresAt: expiresAt(dependencies.now()),
        }),
      );
    },
  );

  app.delete(
    "/api/research/anonymous/cart/items",
    privateHeaders,
    async (req, res) => {
      const secret = anonymousSecret(req);
      const parsed = removeInput.safeParse(req.body);
      if (!secret || !parsed.success) {
        res
          .status(parsed.success ? 404 : 400)
          .json({ ok: false, code: parsed.success ? "not_found" : "invalid_input" });
        return;
      }
      send(
        res,
        await dependencies.carts.removeAnonymousItem(secret, parsed.data),
      );
    },
  );
}
