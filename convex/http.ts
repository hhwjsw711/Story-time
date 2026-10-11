import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import {
  addMomentInput,
  describeProblem,
  inputSchemaOf,
  listExperiencesInput,
  listMomentsInput,
  TOOLS,
  updateMomentInput,
  type ToolName,
} from "./mcpTools";

// The assistant endpoint (MCP over Streamable HTTP, JSON responses only). A
// person connects with a token from the Agents page, sent as a bearer token.
// Nothing here is stored between requests.

const MAX_BODY_BYTES = 64 * 1024;
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const LATEST_PROTOCOL = "2025-06-18";
const GENERIC_FAILURE = "Something went wrong on our side. Try again in a moment.";
const INSTRUCTIONS = [
  "Story-time keeps the moments of experiences people share: when, where and what they noted.",
  "Call list_experiences first to find an experience, then list_moments to read it, or add_moment and update_moment to write.",
  "Everything you add or change is labelled as an assistant's, and you can only do what the person can do.",
].join("\n");

type RpcId = string | number | null;

// A JSON-RPC request or notification, checked before anything else is done.
const rpcMessage = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

// Bad arguments for a tool. Reported to the assistant as a tool error, not as a protocol error.
class BadArguments extends Error {}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

// The data a ConvexError carries. The marker is checked too, so an error that
// crossed a function boundary as a copy is still recognised.
function dataOf(e: unknown): Record<string, unknown> | undefined {
  if (!isRecord(e)) return undefined;
  const marked = e instanceof ConvexError || Reflect.get(e, Symbol.for("ConvexError")) === true;
  if (!marked) return undefined;
  const data: unknown = Reflect.get(e, "data");
  return isRecord(data) ? data : undefined;
}

function codeOf(e: unknown): string | undefined {
  const code = dataOf(e)?.code;
  return typeof code === "string" ? code : undefined;
}

function messageOf(e: unknown): string | undefined {
  const message = dataOf(e)?.message;
  return typeof message === "string" ? message : undefined;
}

// Only the error's name is logged. Its message can echo the arguments it was
// called with, and those include the token.
function errorName(e: unknown): string {
  return e instanceof Error ? e.name : "unknown error";
}

function bearerToken(request: Request): string | null {
  const match = /^bearer\s+(\S+)$/i.exec((request.headers.get("authorization") ?? "").trim());
  return match === null ? null : match[1];
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function result(id: RpcId, value: unknown): object {
  return { jsonrpc: "2.0", id, result: value };
}

function failure(id: RpcId, code: number, message: string): object {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function idOf(message: unknown): RpcId {
  const id = isRecord(message) ? message.id : undefined;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

function unauthorized(): Response {
  return json(
    failure(
      null,
      -32001,
      "This assistant connection is missing or has been disconnected. Make a new one on the Agents page.",
    ),
    401,
    { "WWW-Authenticate": 'Bearer realm="story-time"' },
  );
}

function tooLarge(): Response {
  return json(
    failure(null, -32600, "That request is too large. Keep each request under 64 KB."),
    413,
  );
}

function isToolCall(message: unknown): boolean {
  return isRecord(message) && message.method === "tools/call";
}

function toolReply(value: unknown): object {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function toolError(message: string): object {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function toolFailure(name: ToolName, e: unknown): object {
  if (e instanceof BadArguments) return toolError(e.message);
  const message = messageOf(e);
  if (message === undefined) console.error("MCP tool failed:", name, errorName(e));
  return toolError(message ?? GENERIC_FAILURE);
}

function initializeResult(params: unknown) {
  const asked = isRecord(params) && typeof params.protocolVersion === "string" ? params.protocolVersion : undefined;
  return {
    protocolVersion: PROTOCOL_VERSIONS.find((version) => version === asked) ?? LATEST_PROTOCOL,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "story-time", title: "Story-time", version: "1.0.0" },
    instructions: INSTRUCTIONS,
  };
}

function descriptorOf(tool: (typeof TOOLS)[number]) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: inputSchemaOf(tool),
    annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, openWorldHint: false },
  };
}

// Checks the arguments against the tool's own schema, then runs the tool as one
// internal mutation. Each tool checks the token itself, in that transaction.
async function runTool(ctx: ActionCtx, token: string, name: ToolName, raw: unknown): Promise<unknown> {
  switch (name) {
    case "list_experiences": {
      const args = listExperiencesInput.safeParse(raw);
      if (!args.success) throw new BadArguments(describeProblem(args.error));
      return ctx.runMutation(internal.mcp.list_experiences, { token });
    }
    case "list_moments": {
      const args = listMomentsInput.safeParse(raw);
      if (!args.success) throw new BadArguments(describeProblem(args.error));
      return ctx.runMutation(internal.mcp.list_moments, { token, ...args.data });
    }
    case "add_moment": {
      const args = addMomentInput.safeParse(raw);
      if (!args.success) throw new BadArguments(describeProblem(args.error));
      return ctx.runMutation(internal.mcp.add_moment, { token, ...args.data });
    }
    case "update_moment": {
      const args = updateMomentInput.safeParse(raw);
      if (!args.success) throw new BadArguments(describeProblem(args.error));
      return ctx.runMutation(internal.mcp.update_moment, { token, ...args.data });
    }
  }
}

async function callTool(ctx: ActionCtx, token: string, id: RpcId, params: unknown): Promise<object> {
  if (!isRecord(params) || typeof params.name !== "string") {
    return failure(id, -32602, "Invalid params: tools/call needs the name of a tool.");
  }
  const tool = TOOLS.find((candidate) => candidate.name === params.name);
  if (tool === undefined) {
    return failure(id, -32602, `Unknown tool: ${params.name.slice(0, 100)}`);
  }
  try {
    return result(id, toolReply(await runTool(ctx, token, tool.name, params.arguments ?? {})));
  } catch (e) {
    // A token that's gone or over its limit is refused for the whole request.
    if (codeOf(e) === "UNAUTHORIZED") throw e;
    return result(id, toolFailure(tool.name, e));
  }
}

// Answers one message in a request. Null when there is nothing to send back.
async function respond(ctx: ActionCtx, token: string, message: unknown): Promise<object | null> {
  const parsed = rpcMessage.safeParse(message);
  if (!parsed.success) {
    return failure(idOf(message), -32600, "Invalid request: expected a JSON-RPC 2.0 message with a method.");
  }
  // A message without an id is a notification: nothing is sent back for it.
  const id: RpcId | undefined = parsed.data.id;
  if (id === undefined) return null;
  const { method, params } = parsed.data;
  switch (method) {
    case "initialize":
      return result(id, initializeResult(params));
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: TOOLS.map(descriptorOf) });
    case "tools/call":
      return callTool(ctx, token, id, params);
    default:
      return failure(id, -32601, `Method not found: ${method.slice(0, 100)}`);
  }
}

// Handles the body: one message or a batch. The token is checked before the
// first answer, so a bad token is a 401 whatever the body says.
async function serve(ctx: ActionCtx, token: string, body: string): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    await ctx.runMutation(internal.mcp.ping, { token });
    return json(failure(null, -32700, "Parse error: the body isn't valid JSON."), 400);
  }
  const messages: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  if (messages.length === 0) {
    await ctx.runMutation(internal.mcp.ping, { token });
    return json(failure(null, -32600, "Invalid request: an empty batch."), 400);
  }
  // A tool call checks the token inside its own transaction, so its rate limit
  // counts once. Anything else checks it here first.
  if (messages.some((message) => !isToolCall(message))) {
    await ctx.runMutation(internal.mcp.ping, { token });
  }

  const replies: object[] = [];
  for (const message of messages) {
    const reply = await respond(ctx, token, message);
    if (reply !== null) replies.push(reply);
  }
  if (replies.length === 0) return new Response(null, { status: 202 });
  if (Array.isArray(parsed)) return json(replies, 200);
  const invalid = !rpcMessage.safeParse(parsed).success;
  return json(replies[0], invalid ? 400 : 200);
}

async function handleMcp(ctx: ActionCtx, request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (token === null) return unauthorized();
  if (Number(request.headers.get("content-length") ?? NaN) > MAX_BODY_BYTES) return tooLarge();
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return tooLarge();
  try {
    return await serve(ctx, token, body);
  } catch (e) {
    const code = codeOf(e);
    if (code === "UNAUTHORIZED") return unauthorized();
    if (code === "RATE_LIMITED") {
      return json(failure(null, -32000, messageOf(e) ?? "Slow down."), 429, { "Retry-After": "60" });
    }
    console.error("MCP request failed:", errorName(e));
    return json(failure(null, -32603, GENERIC_FAILURE), 500);
  }
}

const http = httpRouter();

http.route({
  path: "/mcp",
  method: "POST",
  handler: httpAction(async (ctx, request) => handleMcp(ctx, request)),
});

// The stream and session endpoints aren't offered: each POST stands alone.
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });

http.route({
  path: "/mcp",
  method: "GET",
  handler: httpAction(async () => notAllowed()),
});

http.route({
  path: "/mcp",
  method: "DELETE",
  handler: httpAction(async () => notAllowed()),
});

export default http;
