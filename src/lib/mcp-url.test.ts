import { describe, expect, test } from "vitest";
import { mcpUrlFor } from "./mcp-url";

describe("mcpUrlFor", () => {
  test("a standard Convex deployment address maps to its site's /mcp", () => {
    expect(mcpUrlFor("https://happy-animal-123.convex.cloud")).toBe(
      "https://happy-animal-123.convex.site/mcp",
    );
    expect(mcpUrlFor("https://happy-animal-123.convex.cloud/")).toBe(
      "https://happy-animal-123.convex.site/mcp",
    );
  });

  test("anything it can't map reads as undefined, so the page asks for the address", () => {
    const unmappable = [
      undefined,
      "",
      "not a url",
      "http://127.0.0.1:3210",
      "https://app.example.com",
      "https://a.b.convex.cloud",
      "https://x.convex.cloud:8443",
      "https://x.convex.cloud/api",
      "https://x.convex.cloud?x=1",
      "https://x.convex.cloud.example.com",
    ];
    for (const url of unmappable) {
      expect(mcpUrlFor(url)).toBeUndefined();
    }
  });
});
