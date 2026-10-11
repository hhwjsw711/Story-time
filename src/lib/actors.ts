// Who made something: a person, an agent (an AI working for a person, like
// Scribe or an assistant connected over MCP) or the system. The server stores
// an agent's name and leaves people unmarked; this is where that becomes a kind.
export type ActorView =
  | { kind: "human"; name?: string }
  | { kind: "agent"; name: string; onBehalfOf?: string }
  | { kind: "system" };

// A moment's author: the person, or the agent that added it for them.
export function authorOf(m: { authorName?: string; authorAgent?: string }): ActorView {
  return m.authorAgent === undefined
    ? { kind: "human", name: m.authorName }
    : { kind: "agent", name: m.authorAgent, onBehalfOf: m.authorName };
}

// A moment's latest editor, once it has been edited.
export function editorOf(m: {
  editedAt?: number;
  editedByName?: string;
  editedByAgent?: string;
}): ActorView | undefined {
  if (m.editedAt === undefined) return undefined;
  if (m.editedByAgent !== undefined) {
    return { kind: "agent", name: m.editedByAgent, onBehalfOf: m.editedByName };
  }
  return m.editedByName === undefined ? { kind: "system" } : { kind: "human", name: m.editedByName };
}

// A change in the activity log. `name` is the person's display name, when the
// caller has looked it up.
export function changeActorOf(c: { actorId?: string; agent?: string }, name?: string): ActorView {
  if (c.agent !== undefined) return { kind: "agent", name: c.agent, onBehalfOf: name };
  return c.actorId === undefined ? { kind: "system" } : { kind: "human", name };
}

// The words for an actor, for labels and tooltips.
export function describeActor(actor: ActorView): string {
  switch (actor.kind) {
    case "human":
      return actor.name ?? "Anonymous";
    case "agent":
      return actor.onBehalfOf ? `${actor.name}, an AI agent working for ${actor.onBehalfOf}` : `${actor.name}, an AI agent`;
    case "system":
      return "The system";
  }
}

export const isAgent = (actor: ActorView): actor is Extract<ActorView, { kind: "agent" }> => actor.kind === "agent";
