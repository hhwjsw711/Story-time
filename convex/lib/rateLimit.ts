import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

// Per-person allowances. Token buckets refill steadily, so a burst at the end
// of one hour can't add up with the start of the next.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // AI fill-ins (Haiku notes, Jev transports), one per enrich call: enough for
  // a big import, not for a runaway client.
  enrich: { kind: "token bucket", rate: 120, period: HOUR },
  // Typed requests to change moments ("move this to Friday"): each reads the
  // sentence with two models, so fewer than fill-ins.
  command: { kind: "token bucket", rate: 60, period: HOUR },
  // Spoken requests turned into text; each is paid for by the project.
  voice: { kind: "token bucket", rate: 40, period: HOUR },
});
