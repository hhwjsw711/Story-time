import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { CommandBar } from "@/components/event/command-bar";
import { ExperienceShell } from "@/components/event/experience-shell";
import { EditorPanel, type Panel } from "@/components/event/itinerary-panel";
import { Timeline } from "@/components/event/timeline";
import { cn } from "@/lib/utils";

const search = z.object({
  // Sections that were tabs here are pages of their own now; links to them
  // are sent on (see beforeLoad).
  tab: z.enum(["itinerary", "shared", "activity", "canvas", "journal", "settings"]).optional().catch(undefined),
  panel: z.enum(["outline", "details", "moment"]).default("outline").catch("outline"),
  // The moment picked in the list.
  momentId: z.string().optional().catch(undefined),
  // The moment open in the editor, kept apart so picking another never swaps
  // out unsaved edits.
  editId: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/e/$id/")({
  // Old edit links name the moment in `momentId` only.
  validateSearch: search.transform((s) => (s.panel === "moment" && !s.editId && s.momentId ? { ...s, editId: s.momentId } : s)),
  beforeLoad: ({ search: s, params }) => {
    if (s.tab === "shared") throw redirect({ to: "/e/$id/shared", params });
    if (s.tab === "activity") throw redirect({ to: "/e/$id/activity", params });
    if (s.tab === "canvas" || s.tab === "journal") throw redirect({ to: "/e/$id/journal", params });
  },
  component: EventPage,
});

function EventPage() {
  const { id } = Route.useParams();
  const { panel, momentId, editId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const me = useQuery(api.users.getCurrentUser);

  return (
    <ExperienceShell id={id} section="Moments">
      {(event) => {
        const isOwner = event.role === "owner";
        const archived = event.status === "archived";
        const canEditMoment = (authorId: string) => !archived && (isOwner || authorId === me?.id);
        // Editors open beside the moments.
        const openPanel = (next: Panel, nextMomentId?: string) =>
          void navigate({
            search: (s) => ({
              ...s,
              tab: undefined,
              panel: next,
              momentId: nextMomentId ?? (next === "outline" ? s.momentId : undefined),
              editId: next === "moment" ? nextMomentId : undefined,
            }),
          });
        // Picking a moment edits it when you may; otherwise it opens in the story.
        const pick = (moment: { _id: string; authorId: string }) => {
          if (canEditMoment(moment.authorId)) openPanel("moment", moment._id);
          else void navigate({ to: "/e/$id/story", params: { id }, search: { momentId: moment._id } });
        };
        return (
          /* The moments, and beside them whatever is being edited. Stacked on
             narrow screens, the editor first. */
          <div className={cn("grid gap-6", panel !== "outline" && "lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start")}>
            {panel !== "outline" && (
              <div className="min-w-0 lg:sticky lg:top-4 lg:order-2">
                <EditorPanel event={event} panel={panel} momentId={editId} canEditMoment={canEditMoment} onClose={() => openPanel("outline")} />
              </div>
            )}
            <div className="min-w-0 max-w-3xl space-y-4 lg:order-1">
              <CommandBar event={event} openMomentId={momentId} />
              <Timeline event={event} meId={me?.id} selectedMomentId={momentId} onPick={pick} />
            </div>
          </div>
        );
      }}
    </ExperienceShell>
  );
}
