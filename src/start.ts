import { createMiddleware, createStart } from "@tanstack/react-start";

// Pages can't be framed (clickjacking), sniffed into another type, or pass the
// full URL on to other sites, which matters for share links that carry a token.
const securityHeaders = createMiddleware({ type: "request" }).server(async ({ next }) => {
  const result = await next();
  const headers = result.response.headers;
  if (headers.get("content-type")?.startsWith("text/html")) {
    headers.set("X-Frame-Options", "DENY");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return result;
});

// SSR is off app-wide: routes render in the browser. The shell and the root
// route's head() still render on the server, for link previews and the
// no-flash theme script.
export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [securityHeaders],
}));
