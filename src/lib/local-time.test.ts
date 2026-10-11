import { describe, expect, test } from "vitest";
import { formatDateTime, formatDay, formatTime, localParts } from "./local-time";

// 22:15 UTC on 8 November: 7:15 on the 9th in Japan (UTC+9), 5:15 pm on the 8th
// in New York (UTC-5). The same moment reads differently depending on the zone.
const KYOTO = Date.UTC(2025, 10, 8, 22, 15);

// Month, day, hour and minute, read from the Date's UTC fields.
const wallClock = (d: Date) => [d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];

describe("localParts", () => {
  test("shows the wall clock at the offset the moment happened at", () => {
    expect(wallClock(localParts(KYOTO, 540))).toEqual([10, 9, 7, 15]);
  });

  test("a negative offset moves the clock back, into the day before", () => {
    expect(wallClock(localParts(KYOTO, -300))).toEqual([10, 8, 17, 15]);
  });

  test("with no offset, shows the viewer's own clock", () => {
    const local = new Date(KYOTO);
    expect(wallClock(localParts(KYOTO))).toEqual([local.getMonth(), local.getDate(), local.getHours(), local.getMinutes()]);
  });
});

describe("formatters", () => {
  test("Japan reads 7:15 AM on Nov 9, whatever zone the viewer is in", () => {
    expect(formatTime(KYOTO, 540)).toBe("7:15 AM");
    expect(formatDay(KYOTO, 540, { month: "short", day: "numeric" })).toBe("Nov 9");
    expect(formatDateTime(KYOTO, 540, { dateStyle: "medium", timeStyle: "short" })).toBe("Nov 9, 2025, 7:15 AM");
  });

  test("New York reads 5:15 PM on Nov 8", () => {
    expect(formatTime(KYOTO, -300)).toBe("5:15 PM");
    expect(formatDay(KYOTO, -300, { month: "short", day: "numeric" })).toBe("Nov 8");
  });

  test("with no offset, reads the way the viewer's own clock does", () => {
    const local = new Date(KYOTO);
    expect(formatTime(KYOTO)).toBe(local.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    expect(formatDay(KYOTO, undefined, { month: "short", day: "numeric" })).toBe(
      local.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    );
  });

  test("the zone is always UTC, even if a caller passes another", () => {
    expect(formatDateTime(KYOTO, 540, { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })).toBe("7:15 AM");
  });
});
