/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const T0 = Date.UTC(2026, 5, 1, 12);

async function setup() {
  const t = convexTest(schema, modules);
  const make = (displayName?: string) => t.run((ctx) => ctx.db.insert("users", { displayName }));
  const [ownerId, helperId, viewerId, strangerId] = [
    await make("Sara"),
    await make("Noor"),
    await make("Vee"),
    await make("Stranger"),
  ];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.events.createDraft, {});
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: helperId, grantedBy: ownerId, role: "contributor" }),
  );
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }),
  );
  return {
    t,
    eventId,
    ownerId,
    helperId,
    viewerId,
    owner,
    helper: as(helperId),
    viewer: as(viewerId),
    stranger: as(strangerId),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;
type T = Setup["t"];
type Person = Setup["owner"];

// A connection for a person, made the way the Agents page makes one.
async function connect(who: Person, eventId?: Id<"events">, name = "Claude Desktop") {
  const made = await who.mutation(api.agentTokens.create, { name, eventId });
  return made.token;
}

// Sends one JSON-RPC body to /mcp, with the token as a bearer header when given.
async function post(t: T, token: string | null, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const res = await t.fetch("/mcp", { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  const json: unknown = text === "" ? undefined : JSON.parse(text);
  return { status: res.status, headers: res.headers, text, json };
}

const ToolReply = z.object({
  result: z.object({
    isError: z.boolean().optional(),
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
  }),
});

const RpcError = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});

// Calls one tool and gives back what the assistant would read: the text, and
// the parsed result when it wasn't an error.
async function call(t: T, token: string | null, name: string, args: Record<string, unknown> = {}) {
  const r = await post(t, token, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const reply = ToolReply.parse(r.json);
  const text = reply.result.content[0]?.text ?? "";
  const isError = reply.result.isError === true;
  return { status: r.status, isError, text, data: isError ? undefined : JSON.parse(text) };
}

const TOKEN_IN_THE_WILD = /stk_[A-Za-z0-9_-]{43}/;

describe("the endpoint speaks MCP", () => {
  test("initialize answers with the version asked for, when it is known", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const r = await post(t, token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "story-time", title: "Story-time", version: "1.0.0" },
      },
    });

    const unknown = await post(t, token, {
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    expect(unknown.json).toMatchObject({ result: { protocolVersion: "2025-06-18" } });
  });

  test("tools/list names the four tools, with input schemas an assistant can fill in", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const r = await post(t, token, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    const tools = z
      .object({
        result: z.object({
          tools: z.array(
            z.object({
              name: z.string(),
              description: z.string(),
              inputSchema: z.object({ type: z.literal("object") }).loose(),
            }),
          ),
        }),
      })
      .parse(r.json).result.tools;
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      ["add_moment", "list_experiences", "list_moments", "update_moment"],
    );
    const listMoments = tools.find((tool) => tool.name === "list_moments");
    // limit has a default, so it is optional to the client.
    expect(listMoments?.inputSchema).toMatchObject({ required: ["experienceId"] });
    // Each description gives an example and says what to call first: list_experiences
    // for an experience id, list_moments for a moment id.
    for (const tool of tools) expect(tool.description).toContain("Example");
    const described = (name: string) => tools.find((tool) => tool.name === name)?.description ?? "";
    expect(described("list_experiences")).toContain("Call this first");
    expect(described("list_moments")).toContain("Call list_experiences first");
    expect(described("add_moment")).toContain("Call list_experiences first");
    expect(described("update_moment")).toContain("Call list_moments first");
  });

  test("notifications are acknowledged with 202 and no body", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const r = await post(t, token, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(r.status).toBe(202);
    expect(r.text).toBe("");
  });

  test("ping, unknown methods, unknown tools and malformed bodies get JSON-RPC errors", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    expect((await post(t, token, { jsonrpc: "2.0", id: 4, method: "ping" })).json).toEqual({
      jsonrpc: "2.0",
      id: 4,
      result: {},
    });
    expect(RpcError.parse((await post(t, token, { jsonrpc: "2.0", id: 5, method: "nope" })).json).error.code).toBe(-32601);
    expect(
      RpcError.parse(
        (await post(t, token, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "delete_everything" } })).json,
      ).error.code,
    ).toBe(-32602);

    const notJson = await post(t, token, undefined);
    expect(notJson.status).toBe(400);
    expect(RpcError.parse(notJson.json).error.code).toBe(-32700);
    const notRpc = await post(t, token, { id: 7, method: "ping" });
    expect(notRpc.status).toBe(400);
    expect(RpcError.parse(notRpc.json).error.code).toBe(-32600);
  });

  test("a batch gets one answer per request, and nothing back for notifications", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const r = await post(t, token, [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);
    expect(r.status).toBe(200);
    const replies = z.array(z.object({ id: z.number() })).parse(r.json);
    expect(replies.map((reply) => reply.id)).toEqual([1, 2]);
  });

  test("GET and DELETE are 405, and say only POST is allowed", async () => {
    const { t } = await setup();
    for (const method of ["GET", "DELETE"]) {
      const res = await t.fetch("/mcp", { method });
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    }
  });

  test("a body over 64 KB is refused with 413", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const padding = "x".repeat(65 * 1024);
    const r = await post(t, token, { jsonrpc: "2.0", id: 1, method: "ping", params: { padding } });
    expect(r.status).toBe(413);
  });
});

describe("a connection's token", () => {
  test("no token, an unknown token and a revoked one are all 401 with the challenge", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };

    const none = await post(t, null, body);
    expect(none.status).toBe(401);
    expect(none.headers.get("WWW-Authenticate")).toBe('Bearer realm="story-time"');
    expect(RpcError.parse(none.json).error.code).toBe(-32001);

    const unknown = await post(t, `stk_${"A".repeat(43)}`, body);
    expect(unknown.status).toBe(401);
    expect(unknown.text).not.toContain("stk_");

    const made = await owner.query(api.agentTokens.list, {});
    await owner.mutation(api.agentTokens.revoke, { id: made[0]!._id });
    const revoked = await post(t, token, body);
    expect(revoked.status).toBe(401);
    const revokedCall = await post(t, token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_experiences", arguments: {} },
    });
    expect(revokedCall.status).toBe(401);
    expect(revokedCall.headers.get("WWW-Authenticate")).toBe('Bearer realm="story-time"');
  });

  test("a malformed body with a bad token is still 401, never a parse error", async () => {
    const { t } = await setup();
    const r = await post(t, `stk_${"B".repeat(43)}`, undefined);
    expect(r.status).toBe(401);
  });

  test("a bad token is a 401 even when the tool name or its arguments are wrong", async () => {
    const { t } = await setup();
    const bad = `stk_${"C".repeat(43)}`;
    const unknownTool = await post(t, bad, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "delete_everything" },
    });
    expect(unknownTool.status).toBe(401);
    const badArguments = await post(t, bad, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_moments", arguments: {} },
    });
    expect(badArguments.status).toBe(401);
    // Without an id it is a notification, which gets no answer, but the token is still checked.
    const notification = await post(t, bad, {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "list_experiences", arguments: {} },
    });
    expect(notification.status).toBe(401);
  });

  test("the rate limit allows 60 requests in a minute and refuses the 61st", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const body = { jsonrpc: "2.0", id: 1, method: "ping" };
    for (let i = 0; i < 60; i++) {
      expect((await post(t, token, body)).status).toBe(200);
    }
    const refused = await post(t, token, body);
    expect(refused.status).toBe(429);
    expect(refused.text).toContain("60 requests a minute");
    expect(refused.text).not.toMatch(TOKEN_IN_THE_WILD);
  });

  test("a tool call past the limit is a tool error, which the assistant can read", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    for (let i = 0; i < 60; i++) {
      await post(t, token, { jsonrpc: "2.0", id: i, method: "ping" });
    }
    const refused = await call(t, token, "list_experiences");
    expect(refused.status).toBe(200);
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("Slow down");
  });
});

describe("tokens for the Agents page", () => {
  test("a token is returned once and never listed; the list shows its prefix only", async () => {
    const { owner, eventId } = await setup();
    const made = await owner.mutation(api.agentTokens.create, { name: "  Claude   Desktop  ", eventId });
    expect(made.token).toMatch(/^stk_[A-Za-z0-9_-]{43}$/);
    expect(made.prefix).toBe(made.token.slice(0, 8));

    const rows = await owner.query(api.agentTokens.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Claude Desktop",
      prefix: made.prefix,
      eventId,
      eventTitle: "Untitled experience",
    });
    expect(JSON.stringify(rows)).not.toContain(made.token);
    expect(JSON.stringify(rows)).not.toContain("tokenKey");
  });

  test("a name that is empty once trimmed is refused", async () => {
    const { owner } = await setup();
    await expect(owner.mutation(api.agentTokens.create, { name: "   " })).rejects.toThrow(/Give the assistant a name/);
  });

  test("the limit is ten live connections; revoking one frees a place", async () => {
    const { owner } = await setup();
    const made = [];
    for (let i = 0; i < 10; i++) {
      made.push(await owner.mutation(api.agentTokens.create, { name: `Tool ${i}` }));
    }
    await expect(owner.mutation(api.agentTokens.create, { name: "One more" })).rejects.toThrow(
      /You can have 10 assistants connected at once/,
    );
    await owner.mutation(api.agentTokens.revoke, { id: made[0]!.id });
    await expect(owner.mutation(api.agentTokens.create, { name: "One more" })).resolves.toMatchObject({
      prefix: expect.any(String),
    });
  });

  test("revoking is the person's own to do, and doing it twice is harmless", async () => {
    const { owner, helper, eventId } = await setup();
    const made = await owner.mutation(api.agentTokens.create, { name: "Mine", eventId });
    await expect(helper.mutation(api.agentTokens.revoke, { id: made.id })).rejects.toThrow(
      /no longer exists/,
    );
    await owner.mutation(api.agentTokens.revoke, { id: made.id });
    await owner.mutation(api.agentTokens.revoke, { id: made.id });
    const [row] = await owner.query(api.agentTokens.list, {});
    expect(row?.revokedAt).toBeGreaterThan(0);
  });

  test("a connection can't be limited to an experience the person only views", async () => {
    const { viewer, eventId } = await setup();
    await expect(viewer.mutation(api.agentTokens.create, { name: "Nope", eventId })).rejects.toThrow(
      /Event not found/,
    );
  });

  test("the experience title stays only while the person still has a say in it", async () => {
    const { t, helper, helperId, eventId } = await setup();
    await connect(helper, eventId, "Helper's");
    const [mine] = await helper.query(api.agentTokens.list, {});
    expect(mine?.eventTitle).toBe("Untitled experience");
    await t.run(async (ctx) => {
      const grant = await ctx.db
        .query("sessions")
        .withIndex("by_event_and_user", (q) => q.eq("eventId", eventId).eq("userId", helperId))
        .unique();
      if (grant !== null) await ctx.db.patch("sessions", grant._id, { revokedAt: Date.now() });
    });
    const [after] = await helper.query(api.agentTokens.list, {});
    expect(after?.eventTitle).toBeUndefined();
  });

  test("using a connection records when it was last used", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    expect((await owner.query(api.agentTokens.list, {}))[0]?.lastUsedAt).toBeUndefined();
    await call(t, token, "list_experiences");
    expect((await owner.query(api.agentTokens.list, {}))[0]?.lastUsedAt).toBeGreaterThan(0);
  });
});

describe("the tools", () => {
  test("list_experiences lists what the person can add to, and nothing archived", async () => {
    const { t, owner, eventId } = await setup();
    const other = await owner.mutation(api.events.createDraft, {});
    await owner.mutation(api.events.update, { eventId: other, status: "archived" });
    const token = await connect(owner);
    const r = await call(t, token, "list_experiences", {});
    expect(r.isError).toBe(false);
    expect(r.data).toEqual([
      expect.objectContaining({ id: eventId, title: "Untitled experience", momentCount: 0, role: "owner" }),
    ]);
  });

  test("a connection for a helper lists the experiences they contribute to, not those they only view", async () => {
    const { t, helper, viewer, eventId } = await setup();
    const helperToken = await connect(helper);
    expect((await call(t, helperToken, "list_experiences")).data).toEqual([
      expect.objectContaining({ id: eventId, role: "contributor" }),
    ]);
    const viewerToken = await connect(viewer);
    expect((await call(t, viewerToken, "list_experiences")).data).toEqual([]);
  });

  test("add_moment writes a moment labelled as the agent, for the person it acts for", async () => {
    const { t, owner, ownerId, eventId } = await setup();
    const token = await connect(owner, eventId);
    const added = await call(t, token, "add_moment", {
      experienceId: eventId,
      when: "2026-06-01T14:30:00+02:00",
      place: "Alfama, Lisbon",
      lat: 38.711,
      lng: -9.13,
      note: "Tram 28 was full, so we walked up",
      mood: "😊",
      transport: "walk",
      labels: ["tram", "lisbon"],
      links: [{ url: "https://example.com/tram", title: "The route" }],
      stops: [{ place: "Miradouro", note: "The whole city in one view" }],
    });
    expect(added.isError).toBe(false);
    expect(added.data).toMatchObject({ id: expect.any(String), summary: expect.stringContaining("Alfama") });

    const [moment] = await owner.query(api.moments.list, { eventId });
    expect(moment).toMatchObject({
      authorId: ownerId,
      authorName: "Sara",
      authorAgent: "Claude Desktop",
      place: "Alfama, Lisbon",
      geo: { lat: 38.711, lng: -9.13 },
      transport: "walk",
      labels: ["tram", "lisbon"],
      startsAt: Date.UTC(2026, 5, 1, 12, 30),
      // The offset the time was given with, so the moment keeps its own zone.
      tzOffsetMinutes: 120,
    });
    expect(moment?.blocks).toEqual([
      { type: "link", url: "https://example.com/tram", title: "The route" },
      { type: "feeling", text: "Tram 28 was full, so we walked up", mood: "😊" },
    ]);
    expect(moment?.stops).toEqual([
      expect.objectContaining({ place: "Miradouro", blocks: [{ type: "note", text: "The whole city in one view" }] }),
    ]);

    const changes = await t.run((ctx) => ctx.db.query("changes").take(100));
    const made = changes.find((c) => c.entity === "moment" && c.action === "create");
    expect(made?.agent).toBe("Claude Desktop");
    expect(made?.actorId).toBe(ownerId);
  });

  test("the same call sent again is the same moment, not a twin; a different one is new", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const args = { experienceId: eventId, place: "Pontocho Alley", note: "Dinner by the river" };
    const first = await call(t, token, "add_moment", args);
    const again = await call(t, token, "add_moment", args);
    expect(again.isError).toBe(false);
    expect(again.data).toMatchObject({ id: first.data.id, summary: expect.stringContaining("Already added") });
    expect(await owner.query(api.moments.list, { eventId })).toHaveLength(1);

    // Other words are another moment.
    await call(t, token, "add_moment", { ...args, note: "Dessert by the river" });
    expect(await owner.query(api.moments.list, { eventId })).toHaveLength(2);
  });

  test("a note without a mood is a plain note, and the time without an offset is UTC", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    await call(t, token, "add_moment", { experienceId: eventId, when: "2026-06-03", note: "Quiet morning" });
    const [moment] = await owner.query(api.moments.list, { eventId });
    expect(moment?.blocks).toEqual([{ type: "note", text: "Quiet morning" }]);
    expect(moment?.startsAt).toBe(Date.UTC(2026, 5, 3, 12));
  });

  test("an offset in when sets the day the moment is filed under, in that zone", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    await call(t, token, "add_moment", {
      experienceId: eventId,
      when: "2026-06-01T23:30:00-05:00",
      note: "Late dinner",
    });
    const rows = await t.run((ctx) => ctx.db.query("itinerary").take(100));
    expect(rows.map((row) => row.dayKey)).toEqual(["2026-06-01"]);
    const listed = await call(t, token, "list_moments", { experienceId: eventId });
    expect(listed.data).toEqual([expect.objectContaining({ when: "2026-06-02T04:30:00.000Z" })]);
  });

  test("list_moments returns the newest first, up to the limit, with notes cut to 300 characters", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const long = "a".repeat(400);
    for (const [day, note] of [
      ["2026-06-01", "first"],
      ["2026-06-02", long],
      ["2026-06-03", "third"],
    ] as const) {
      await call(t, token, "add_moment", { experienceId: eventId, when: day, note });
    }
    const listed = await call(t, token, "list_moments", { experienceId: eventId, limit: 2 });
    const moments = z
      .array(z.object({ notes: z.array(z.string()), when: z.string(), by: z.object({ kind: z.string(), name: z.string().optional() }) }))
      .parse(listed.data);
    expect(moments.map((m) => m.notes)).toEqual([["third"], [`${"a".repeat(299)}…`]]);
    expect(moments[0]?.by).toEqual({ kind: "agent", name: "Claude Desktop" });
  });

  test("list_moments counts stops and photos, and reports who last edited a moment", async () => {
    const { t, owner, eventId } = await setup();
    const { mediaId } = await owner.mutation(api.media.reserveUpload, { eventId, size: 100, mime: "image/jpeg" });
    await owner.mutation(api.media.confirmUpload, { mediaId });
    await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      place: "Sintra",
      blocks: [{ type: "photo", mediaId }, { type: "note", text: "Fog on the palace" }],
      stops: [{ place: "Pena", blocks: [] }],
    });
    const token = await connect(owner, eventId);
    const listed = await call(t, token, "list_moments", { experienceId: eventId });
    expect(listed.data).toEqual([
      expect.objectContaining({
        place: "Sintra",
        stops: 1,
        photos: 1,
        notes: ["Fog on the palace"],
        by: { kind: "person", name: "Sara" },
      }),
    ]);
    const [moment] = z.array(z.object({ id: z.string() })).parse(listed.data);
    await call(t, token, "update_moment", { momentId: moment?.id, addNote: "Clouds lifted at noon" });
    const after = await call(t, token, "list_moments", { experienceId: eventId });
    expect(after.data).toEqual([
      expect.objectContaining({ editedBy: { kind: "agent", name: "Claude Desktop" } }),
    ]);
  });

  test("a connection limited to one experience cannot see or write another", async () => {
    const { t, owner, eventId } = await setup();
    const elsewhere = await owner.mutation(api.events.createDraft, {});
    const token = await connect(owner, eventId);

    const listed = await call(t, token, "list_experiences");
    expect(listed.data).toEqual([expect.objectContaining({ id: eventId })]);

    const read = await call(t, token, "list_moments", { experienceId: elsewhere });
    expect(read.isError).toBe(true);
    expect(read.text).toBe("No experience with that id. Call list_experiences first.");

    const wrote = await call(t, token, "add_moment", { experienceId: elsewhere, note: "Sneaky" });
    expect(wrote.isError).toBe(true);
    expect(wrote.text).toBe("No experience with that id. Call list_experiences first.");

    const ok = await call(t, token, "add_moment", { experienceId: eventId, note: "Allowed" });
    expect(ok.isError).toBe(false);
  });

  test("a viewer's connection can read but not add, and a stranger's sees nothing", async () => {
    const { t, viewer, stranger, owner, eventId } = await setup();
    await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      place: "Lisbon",
      blocks: [{ type: "note", text: "Landed" }],
    });
    const viewerToken = await connect(viewer);
    const read = await call(t, viewerToken, "list_moments", { experienceId: eventId });
    expect(read.isError).toBe(false);
    expect(read.data).toHaveLength(1);
    const wrote = await call(t, viewerToken, "add_moment", { experienceId: eventId, note: "Can I?" });
    expect(wrote.isError).toBe(true);
    expect(wrote.text).toBe("No experience with that id. Call list_experiences first.");

    const strangerToken = await connect(stranger);
    expect((await call(t, strangerToken, "list_experiences")).data).toEqual([]);
    const peek = await call(t, strangerToken, "list_moments", { experienceId: eventId });
    expect(peek.text).toBe("No experience with that id. Call list_experiences first.");
  });

  test("a helper's connection stops working on the experience once their access ends", async () => {
    const { t, helper, helperId, eventId } = await setup();
    const token = await connect(helper, eventId);
    expect((await call(t, token, "list_moments", { experienceId: eventId })).isError).toBe(false);
    await t.run(async (ctx) => {
      const grant = await ctx.db
        .query("sessions")
        .withIndex("by_event_and_user", (q) => q.eq("eventId", eventId).eq("userId", helperId))
        .unique();
      if (grant !== null) await ctx.db.patch("sessions", grant._id, { revokedAt: Date.now() });
    });
    const after = await call(t, token, "list_moments", { experienceId: eventId });
    expect(after.text).toBe("No experience with that id. Call list_experiences first.");
  });

  test("update_moment with addNote keeps the first stop's photos and text, and adds the note last", async () => {
    const { t, owner, eventId } = await setup();
    const { mediaId } = await owner.mutation(api.media.reserveUpload, { eventId, size: 100, mime: "image/jpeg" });
    await owner.mutation(api.media.confirmUpload, { mediaId });
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      place: "Lisbon",
      blocks: [{ type: "photo", mediaId }, { type: "note", text: "Tram 28" }],
    });
    const token = await connect(owner, eventId);
    const edited = await call(t, token, "update_moment", { momentId, addNote: "Found the bakery again" });
    expect(edited.isError).toBe(false);

    const [moment] = await owner.query(api.moments.list, { eventId });
    expect(moment?.blocks).toEqual([
      { type: "photo", mediaId },
      { type: "note", text: "Tram 28" },
      { type: "note", text: "Found the bakery again" },
    ]);
    // An agent's edit names the agent, and the person it acts for.
    expect(moment?.editedByAgent).toBe("Claude Desktop");
    expect(moment?.editedByName).toBe("Sara");
    const photo = await t.run((ctx) => ctx.db.get("media", mediaId));
    expect(photo?.momentId).toBe(momentId);
  });

  test("update_moment changes only what is passed, and null clears transport", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      place: "Lisbon",
      transport: "train",
      blocks: [{ type: "note", text: "Arrived" }],
    });
    const token = await connect(owner, eventId);
    const edited = await call(t, token, "update_moment", { momentId, transport: null, labels: ["arrival"] });
    expect(edited.isError).toBe(false);
    const [moment] = await owner.query(api.moments.list, { eventId });
    expect(moment?.transport).toBeUndefined();
    expect(moment?.labels).toEqual(["arrival"]);
    expect(moment?.place).toBe("Lisbon");
    expect(moment?.blocks).toEqual([{ type: "note", text: "Arrived" }]);
  });

  test("a helper's connection can't change the owner's moment, and nothing is deleted", async () => {
    const { t, owner, helper, eventId } = await setup();
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      blocks: [{ type: "note", text: "Mine" }],
    });
    const helperToken = await connect(helper, eventId);
    const refused = await call(t, helperToken, "update_moment", { momentId, addNote: "Mine too" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe("You can only change moments you added yourself.");
    const [moment] = await owner.query(api.moments.list, { eventId });
    expect(moment?.blocks).toEqual([{ type: "note", text: "Mine" }]);
  });

  test("an update with nothing to change says what it could change", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: T0,
      blocks: [{ type: "note", text: "Here" }],
    });
    const token = await connect(owner, eventId);
    const r = await call(t, token, "update_moment", { momentId });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("Say what to change");
  });

  test("an archived experience takes no new moments", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    await owner.mutation(api.events.update, { eventId, status: "archived" });
    const r = await call(t, token, "add_moment", { experienceId: eventId, note: "Too late" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("archived");
  });

  test("bad arguments are a tool error that says what is wrong, not a protocol error", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const missing = await post(t, token, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "add_moment", arguments: { note: "No experience given" } },
    });
    expect(missing.status).toBe(200);
    const missingReply = ToolReply.parse(missing.json);
    expect(missingReply.result.isError).toBe(true);
    expect(missingReply.result.content[0]?.text).toBe("experienceId: Send the experienceId from list_experiences.");

    const wrongMood = await call(t, token, "add_moment", { experienceId: eventId, note: "Hi", mood: "🙂" });
    expect(wrongMood.isError).toBe(true);
    expect(wrongMood.text).toMatch(/^mood: /);

    const tooMany = await call(t, token, "list_moments", { experienceId: eventId, limit: 500 });
    expect(tooMany.isError).toBe(true);
    expect(tooMany.text).toMatch(/^limit: /);

    const moodWithoutWords = await call(t, token, "add_moment", { experienceId: eventId, mood: "😊" });
    expect(moodWithoutWords.isError).toBe(true);
    expect(moodWithoutWords.text).toBe("Add a few words to go with the mood.");

    const placeOnly = await call(t, token, "add_moment", { experienceId: eventId, place: "Somewhere" });
    expect(placeOnly.isError).toBe(true);
    expect(placeOnly.text).toBe("Add a note or a link so the moment has something to show.");

    const halfPin = await call(t, token, "add_moment", { experienceId: eventId, note: "Hi", place: "Here", lat: 1 });
    expect(halfPin.isError).toBe(true);
    expect(halfPin.text).toBe("Send lat and lng together, or neither.");

    const badDate = await call(t, token, "add_moment", { experienceId: eventId, note: "Hi", when: "2026-02-30" });
    expect(badDate.isError).toBe(true);
    expect(badDate.text).toMatch(/^Use a date like/);
  });

  test("the tools never hand out a token, even in an error", async () => {
    const { t, owner, eventId } = await setup();
    const token = await connect(owner, eventId);
    const r = await call(t, token, "add_moment", { experienceId: "not-an-id", note: "Hi" });
    expect(r.text).not.toContain(token);
    expect(r.text).not.toMatch(TOKEN_IN_THE_WILD);
  });
});
