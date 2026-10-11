import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Backstop for the per-invite expiry timers.
crons.cron(
  "sweep expired invites",
  "17 3 * * *",
  internal.invites.sweepExpired,
  {},
);

// Abandoned upload reservations count toward an experience's cap until swept.
crons.interval("sweep reserved uploads", { hours: 1 }, internal.media.sweepReservedUploads, {});

export default crons;
