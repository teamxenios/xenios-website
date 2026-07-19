// Local preview launcher for the research gateway (screenshots + QA only).
// Boots the PRODUCTION build with throwaway placeholder credentials so the
// password gate and gateway render locally. Never used in deployment; the
// values here are fixtures, not secrets.
process.env.NODE_ENV = "production";
process.env.PORT = process.env.PORT || "5199";
process.env.RESEARCH_ACCESS_PASSWORD = "preview";
process.env.RESEARCH_SESSION_SECRET = "preview-secret-not-production";

await import("../dist/index.cjs");
