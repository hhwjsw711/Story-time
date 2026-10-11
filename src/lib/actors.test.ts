import { describe, expect, test } from "vitest";
import { authorOf, changeActorOf, describeActor, editNoticeOf, editorOf } from "./actors";

describe("authorOf", () => {
  test("a person, with or without a name", () => {
    expect(authorOf({ authorName: "Sara" })).toEqual({ kind: "human", name: "Sara" });
    expect(authorOf({})).toEqual({ kind: "human", name: undefined });
  });

  test("an agent that added it for a person keeps both names", () => {
    expect(authorOf({ authorName: "Sara", authorAgent: "Claude" })).toEqual({
      kind: "agent",
      name: "Claude",
      onBehalfOf: "Sara",
    });
  });
});

describe("editorOf", () => {
  test("nothing until the moment is edited", () => {
    expect(editorOf({})).toBeUndefined();
  });

  test("a person, an agent, or the system", () => {
    expect(editorOf({ editedAt: 1, editedByName: "Noor" })).toEqual({ kind: "human", name: "Noor" });
    expect(editorOf({ editedAt: 1, editedByAgent: "Scribe" })).toEqual({
      kind: "agent",
      name: "Scribe",
      onBehalfOf: undefined,
    });
    expect(editorOf({ editedAt: 1 })).toEqual({ kind: "system" });
  });
});

describe("editNoticeOf", () => {
  test("nothing for a moment that was never edited", () => {
    expect(editNoticeOf({ authorName: "Sara" })).toBeUndefined();
  });

  test("an agent's edit is news, even on the author's own moment", () => {
    expect(editNoticeOf({ authorName: "Sara", editedAt: 5, editedByAgent: "Scribe" })).toEqual({
      at: 5,
      by: { kind: "agent", name: "Scribe", onBehalfOf: undefined },
    });
  });

  test("another person's edit is news; the author's own edit is not", () => {
    expect(editNoticeOf({ authorName: "Sara", editedAt: 5, editedByName: "Noor" })).toEqual({
      at: 5,
      by: { kind: "human", name: "Noor" },
    });
    expect(editNoticeOf({ authorName: "Sara", editedAt: 5, editedByName: "Sara" })).toBeUndefined();
  });

  test("an edit with no name on it is not named", () => {
    expect(editNoticeOf({ authorName: "Sara", editedAt: 5 })).toBeUndefined();
  });
});

describe("changeActorOf", () => {
  test("an agent beats the person it acts for; no actor at all is the system", () => {
    expect(changeActorOf({ actorId: "u1", agent: "Claude" }, "Sara")).toEqual({
      kind: "agent",
      name: "Claude",
      onBehalfOf: "Sara",
    });
    expect(changeActorOf({ actorId: "u1" }, "Sara")).toEqual({ kind: "human", name: "Sara" });
    expect(changeActorOf({})).toEqual({ kind: "system" });
  });
});

describe("describeActor", () => {
  test("says plainly who it was", () => {
    expect(describeActor({ kind: "human", name: "Sara" })).toBe("Sara");
    expect(describeActor({ kind: "human" })).toBe("Anonymous");
    expect(describeActor({ kind: "agent", name: "Scribe" })).toBe("Scribe, an AI agent");
    expect(describeActor({ kind: "agent", name: "Claude", onBehalfOf: "Sara" })).toBe(
      "Claude, an AI agent working for Sara",
    );
    expect(describeActor({ kind: "system" })).toBe("The system");
  });
});
