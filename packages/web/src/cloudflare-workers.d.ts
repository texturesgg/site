// Type declarations for cloudflare:workers module
// This allows the web package to typecheck code that imports from @vgskins/api
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
