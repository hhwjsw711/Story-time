import { env } from "../_generated/server";

const DEV_ORIGIN = "http://localhost:3000";

// The web app's origins, from APP_URL: one URL, or several separated by
// commas (say the apex, www and the workers.dev address). Each may carry a
// trailing slash or a path; OAuth redirect checks and invite links only want
// the bare origin. A malformed entry is skipped with a log line rather than
// breaking every sign-in.
export function appOrigins(): string[] {
  const origins = (env.APP_URL ?? DEV_ORIGIN).split(",").flatMap((raw) => {
    const url = raw.trim();
    if (!url) return [];
    try {
      return [new URL(url).origin];
    } catch {
      console.error(`APP_URL entry "${url}" isn't a URL; use the full origin, like https://example.com`);
      return [];
    }
  });
  return origins.length > 0 ? origins : [DEV_ORIGIN];
}

// The first origin is the one invite links point at.
export function appOrigin(): string {
  return appOrigins()[0]!;
}
