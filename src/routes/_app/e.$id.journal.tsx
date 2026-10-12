import { createFileRoute } from "@tanstack/react-router";
import { ExperienceShell } from "@/components/event/experience-shell";
import { JournalBook } from "@/components/journal/book";

export const Route = createFileRoute("/_app/e/$id/journal")({ component: JournalPage });

// The experience as a journal of A4 pages, full width: the page is the point.
function JournalPage() {
  const { id } = Route.useParams();
  return (
    <ExperienceShell id={id} section="Journal" bare>
      {(event) => <JournalBook event={event} />}
    </ExperienceShell>
  );
}
