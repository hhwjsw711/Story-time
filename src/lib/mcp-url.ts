// The address an assistant connects to. A Convex deployment serves its HTTP
// routes, such as /mcp, on its .convex.site address: the .convex.cloud address
// with the other suffix. Only that standard form can be worked out from the
// deployment URL. A local server or a custom domain gives undefined, and the
// Agents page asks for the address instead.
const CLOUD_SUFFIX = ".convex.cloud";
const DEPLOYMENT_NAME = /^[a-z0-9-]+$/;

export function mcpUrlFor(convexUrl: string | undefined): string | undefined {
  if (convexUrl === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(convexUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(CLOUD_SUFFIX)) return undefined;
  const deployment = url.hostname.slice(0, -CLOUD_SUFFIX.length);
  const plainRoot = (url.pathname === "/" || url.pathname === "") && url.search === "" && url.hash === "";
  if (!DEPLOYMENT_NAME.test(deployment) || url.port !== "" || !plainRoot) return undefined;
  return `https://${deployment}.convex.site/mcp`;
}
