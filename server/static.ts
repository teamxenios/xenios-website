import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { buildRawHttpDocumentResponse } from "./research/seo/raw-http-document-policy";

/**
 * Answer a non-file document request through the raw HTTP document policy.
 *
 * The SPA shell used to be sent for every unknown path at status 200 with the
 * homepage's global metadata and JSON-LD attached, so a crawler, a social
 * unfurler, or a curl saw the homepage's canonical URL and schema on a member
 * page, a private route, or a path that does not exist. The policy resolver
 * classifies the raw request target (public index, public noindex, private,
 * or not found), strips the template's global SEO authority, and injects the
 * exact robots/canonical/og:url head plus route-owned structured data only.
 * Unknown documents answer 404; private and unreviewed documents answer 200
 * noindex without a canonical.
 */
export function sendRawHttpDocument(
  req: Request,
  res: Response,
  templateHtml: string,
  structuredData: readonly unknown[] = [],
): void {
  const document = buildRawHttpDocumentResponse({
    requestTarget: req.originalUrl || req.url,
    templateHtml,
    structuredData,
  });
  res.status(document.status).set(document.headers).send(document.html);
}

export function serveStatic(
  app: Express,
  distPath: string = path.resolve(__dirname, "public"),
) {
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // The built shell is read once; the policy is applied per request because
  // status, robots, and canonical are properties of the request target.
  const templatePath = path.resolve(distPath, "index.html");
  let template: string | null = null;
  const policyDocument = (req: Request, res: Response, next: express.NextFunction) => {
    try {
      template ??= fs.readFileSync(templatePath, "utf8");
      sendRawHttpDocument(req, res, template);
    } catch (error) {
      next(error);
    }
  };

  // The root document and the shell file itself are answered by the policy,
  // never by express.static's index handling, so "/" carries exact robots,
  // canonical, and route-owned schema instead of the raw template's global
  // metadata. Every OTHER directory index under dist/public — the static
  // /hino subtree above all — keeps express.static's production behaviour
  // (index.html served, "/hino" redirected to "/hino/"), byte-for-byte.
  // Registered as a guarded app.use (like the fallback below), not app.get:
  // document routes are not API routes and the route census only admits
  // explicit /api/ paths for app.get registrations.
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path !== "/" && req.path !== "/index.html") return next();
    policyDocument(req, res, next);
  });
  app.use(express.static(distPath));

  // fall through to the policy for every remaining document request
  app.use("/{*path}", policyDocument);
}
