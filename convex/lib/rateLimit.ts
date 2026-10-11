import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

// Per-person allowances. Token buckets refill steadily, so a burst at the end
// of one hour can't add up with the start of the next.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // AI fill-ins (Haiku notes, Jev transports), one per enrich call: enough for
  // a big import, not for a runaway client.
  enrich: { kind: "token bucket", rate: 120, period: HOUR },
});
