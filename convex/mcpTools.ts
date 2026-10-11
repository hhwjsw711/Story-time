import { z } from "zod";
import {
  MAX_LABEL_LENGTH,
  MAX_LABELS_PER_MOMENT,
  MAX_STOPS_PER_MOMENT,
  MAX_TEXT_LENGTH,
} from "./lib/limits";

// The tools an assistant can call, written for the assistant that reads them.
// Every call is checked against its zod schema in http.ts; tools/list publishes
// each schema as JSON Schema.

// The moods the moment form offers. Copied, as scribe.ts does, since convex/
// can't import from src/.
export const MOODS = ["😊", "😍", "😌", "😂", "🥹", "😴"] as const;
// The same values as vTransport in schema.ts.
export const TRANSPORTS = ["walk", "bike", "car", "bus", "train", "plane", "boat", "other"] as const;

const MAX_LINKS = 5;
const MAX_STOPS_AFTER_FIRST = MAX_STOPS_PER_MOMENT - 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const experienceIdInput = z
  .string({ error: "Send the experienceId from list_experiences." })
  .describe("The experience's id, from list_experiences. Example: \"jd7b4z8k2q1m5n9p\".");

const momentIdInput = z
  .string({ error: "Send the momentId from list_moments." })
  .describe("The moment's id, from list_moments. Example: \"k17y3w6r0t8e2u4i\".");

const whenInput = z
  .string()
  .max(40)
  .describe(
    "When it happened, as ISO 8601. Examples: \"2026-06-01T14:30:00+02:00\", \"2026-06-01T14:30\" or \"2026-06-01\" (a plain date means noon). Without an offset the time is taken as UTC.",
  );

const placeInput = z
  .string()
  .max(200)
  .describe("A short place name, like \"Alfama, Lisbon\". When updating, \"\" clears the place.");

const latInput = z
  .number()
  .min(-90)
  .max(90)
  .describe("Latitude, from -90 to 90. Send lat and lng together, and only with a place.");

const lngInput = z
  .number()
  .min(-180)
  .max(180)
  .describe("Longitude, from -180 to 180. Send lat and lng together, and only with a place.");

const transportInput = z
  .enum(TRANSPORTS)
  .describe("How they got there: walk, bike, car, bus, train, plane, boat or other.");

const labelsInput = z
  .array(z.string().max(MAX_LABEL_LENGTH))
  .max(MAX_LABELS_PER_MOMENT)
  .describe("Short tags, like [\"tram\", \"food\"]. Replaces the moment's labels when updating; [] clears them.");

const noteInput = z
  .string()
  .max(MAX_TEXT_LENGTH)
  .describe("Text in the diary voice, first person plural and past tense, like \"We rode the tram to the top\".");

export const listExperiencesInput = z.object({});

export const listMomentsInput = z.object({
  experienceId: experienceIdInput,
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe("How many moments to return, newest first. From 1 to 50; the default is 20."),
});

export const addMomentInput = z.object({
  experienceId: experienceIdInput,
  when: whenInput.optional().describe("When the moment started. Defaults to now."),
  place: placeInput.optional(),
  lat: latInput.optional(),
  lng: lngInput.optional(),
  note: noteInput.optional().describe("The diary line for the moment's first stop. Needs words when a mood is given."),
  mood: z
    .enum(MOODS)
    .optional()
    .describe("One of the app's moods: 😊 😍 😌 😂 🥹 😴. Only goes with a note, which then becomes a feeling."),
  transport: transportInput.optional().describe("How they got to the first stop."),
  labels: labelsInput.optional(),
  links: z
    .array(
      z.object({
        url: z.string().max(2048).describe("A web address starting with https:// or http://."),
        title: z.string().max(200).optional().describe("A short title for the link."),
      }),
    )
    .max(MAX_LINKS)
    .optional()
    .describe("Up to 5 links to add to the first stop."),
  stops: z
    .array(
      z.object({
        when: whenInput.optional(),
        place: placeInput.optional(),
        lat: latInput.optional(),
        lng: lngInput.optional(),
        transport: transportInput.optional(),
        note: noteInput.optional(),
      }),
    )
    .max(MAX_STOPS_AFTER_FIRST)
    .optional()
    .describe("Up to 9 more stops after the first, in order. Each needs a place or a note."),
});

export const updateMomentInput = z.object({
  momentId: momentIdInput,
  when: whenInput.optional(),
  place: placeInput.optional(),
  lat: latInput.optional(),
  lng: lngInput.optional(),
  transport: transportInput
    .nullable()
    .optional()
    .describe("How they got to the first stop. null clears it."),
  labels: labelsInput.optional(),
  addNote: noteInput
    .optional()
    .describe("A note to add to the first stop. Existing text and photos stay as they are."),
});

export type ToolName = "list_experiences" | "list_moments" | "add_moment" | "update_moment";

export const TOOLS: ReadonlyArray<{
  name: ToolName;
  description: string;
  input: z.ZodType;
  readOnly: boolean;
}> = [
  {
    name: "list_experiences",
    description:
      "List the experiences you can add moments to: the ones this person owns or helps with, not archived. Call this first, to get the experienceId the other tools need. Each has id, title, description, startsAt and endsAt (ISO 8601), momentCount and role (owner or contributor). Example result: [{\"id\": \"jd7b4z8k2q1m5n9p\", \"title\": \"Germany 2025\", \"momentCount\": 12, \"role\": \"owner\"}].",
    input: listExperiencesInput,
    readOnly: true,
  },
  {
    name: "list_moments",
    description:
      "Read the most recent moments of one experience, newest first. Call list_experiences first for the experienceId. Each moment has id, when (ISO 8601, UTC), place, lat and lng, transport, labels, notes (the text of its notes and feelings, each cut to 300 characters), stops (how many more stops follow the first), photos (how many photos and videos it has), by (who added it: a person, or an agent with its name) and editedBy (the same, for the latest edit). Example: {\"experienceId\": \"jd7b4z8k2q1m5n9p\", \"limit\": 5}.",
    input: listMomentsInput,
    readOnly: true,
  },
  {
    name: "add_moment",
    description:
      "Add a moment to an experience. Call list_experiences first for the experienceId. Everything added this way is labelled as written by the assistant, for the person it works for. A moment needs something to show: a note or a link on the first stop, or a note on any later stop. Photos and videos can't be added this way; people add those in the app. Example: {\"experienceId\": \"jd7b4z8k2q1m5n9p\", \"when\": \"2026-06-01T14:30\", \"place\": \"Alfama, Lisbon\", \"note\": \"We rode the tram up and got lost in the lanes\", \"mood\": \"😊\", \"transport\": \"walk\"}.",
    input: addMomentInput,
    readOnly: false,
  },
  {
    name: "update_moment",
    description:
      "Change a moment: its when, place (\"\" clears it; a new place without lat and lng drops the old pin), lat and lng (together, with a place), transport (null clears it), labels (replaces them all; [] clears them) or addNote (adds a note to the first stop, keeping its text and photos). Call list_moments first for the momentId. You can change your own moments, and any moment in an experience you own. Nothing is ever deleted. Example: {\"momentId\": \"k17y3w6r0t8e2u4i\", \"addNote\": \"Found the bakery again on the way back\"}.",
    input: updateMomentInput,
    readOnly: false,
  },
];

// The JSON Schema an MCP client fills in. Input mode, so a field with a default
// is optional to the client.
export function inputSchemaOf(tool: { input: z.ZodType }): Record<string, unknown> {
  return z.toJSONSchema(tool.input, { io: "input" });
}

// What a client should be told when its arguments don't fit, in plain words.
export function describeProblem(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return "Those arguments don't fit this tool.";
  const field = issue.path.map(String).join(".");
  const message = issue.message.replace(/^Invalid input: /, "");
  return field === "" ? message : `${field}: ${message}`;
}
