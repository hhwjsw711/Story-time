import { env } from "../_generated/server";

// The web app's origin. APP_URL may carry a trailing slash or a path; OAuth
// redirect checks and invite links only want the bare origin.
export function appOrigin(): string {
  return new URL(env.APP_URL ?? "http://localhost:3000").origin;
}
