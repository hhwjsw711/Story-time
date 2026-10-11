import { useAuthToken } from "@convex-dev/auth/react";
import { useAction, useMutation } from "convex/react";
import { ImagePlusIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { reversePlace } from "@/components/event/place-input";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { deletePhotos } from "@/lib/actions";
import {
  enrichMoment,
  momentsFromPlan,
  type Picked,
  type PlannedDay,
  plural,
  readPicked,
  samplePhotos,
  uploadAll,
} from "@/lib/add-moments";
import { errorMessage } from "@/lib/errors";
import { groupPhotos, type PhotoDay, type PhotoStop } from "@/lib/photo-groups";
import { thumbnail } from "@/lib/thumbs";
import { MEDIA_ACCEPT } from "@/lib/upload";

// Viewers can't add, and nothing is added to an archived experience.
export const canAddTo = (event: EventView) => event.role !== "viewer" && event.status !== "archived";

// The geocoder asks for one lookup at a time, spaced out.
const LOOKUP_GAP_MS = 1100;

// Names each located stop from its coordinates, so the moments get a place
// and a map pin. Runs while the uploads do; a stop it can't name stays unnamed.
async function namePlaces(days: PhotoDay[]): Promise<PlannedDay[]> {
  const located = days.flatMap((d) => d.moments.flat()).flatMap((s) => (s.geo ? [{ stop: s, geo: s.geo }] : []));
  const names = new Map<PhotoStop, string>();
  for (const [i, { stop, geo }] of located.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, LOOKUP_GAP_MS));
    const place = await reversePlace(geo);
    if (place) names.set(stop, place);
  }
  return days.map((d) => ({
    day: d.day,
    moments: d.moments.map((stops) => stops.map((s) => ({ ...s, place: names.get(s) }))),
  }));
}

// The first few problems, for a toast's description.
function details(problems: string[]): string {
  const shown = problems.slice(0, 3).join(" · ");
  return problems.length > 3 ? `${shown} · and ${problems.length - 3} more` : shown;
}

type ButtonProps = ComponentProps<typeof Button>;

// Picks photos and videos and makes their moments in one go, grouped as the
// review sheet groups them, each with its AI note. "Add from photos" stays in
// the menu for choosing which days to add.
export function QuickAddButton({
  event,
  variant = "default",
  size,
  children = "Add",
}: {
  event: EventView;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children?: ReactNode;
}) {
  const createMoment = useMutation(api.moments.create);
  const enrich = useAction(api.ai.enrich.enrich);
  const token = useAuthToken();
  // Read at each call: tokens are short-lived and a batch can run for minutes.
  const latestToken = useRef(token);
  useEffect(() => {
    latestToken.current = token;
  }, [token]);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!canAddTo(event)) return null;

  async function addPhotos(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0 || !token) return;
    setBusy(true);
    const toastId = toast.loading("Reading photos…");
    try {
      let n = 0;
      const { picked, problems: skipped } = await readPicked(files, new Set(), () => `p${n++}`);
      if (picked.length === 0) {
        toast.error(`Nothing to add · ${plural(skipped.length, "problem")}`, { id: toastId, description: details(skipped) });
        return;
      }
      const days = groupPhotos(picked.map((p) => p.point));
      // Checked before anything uploads, so no photo goes up that can't be added.
      const planned = days.reduce((count, d) => count + d.moments.length, 0);
      const left = Math.max(0, event.momentLimit - event.momentCount);
      if (planned > left) {
        toast.error(
          `These photos make ${plural(planned, "moment")}, and this experience has room for ${left}. Choose fewer, or pick days with Add from photos.`,
          { id: toastId },
        );
        return;
      }

      const pickedOf = new Map<string, Picked>(picked.map((p) => [p.point.id, p]));
      const picksOf = (stops: PhotoStop[]) => stops.flatMap((s) => s.photos).flatMap((p) => pickedOf.get(p.id) ?? []);
      // The AI's thumbnails and the place names are made while the uploads run.
      for (const stops of days.flatMap((d) => d.moments)) {
        for (const p of samplePhotos(picksOf(stops))) void thumbnail(p.file);
      }
      const naming = namePlaces(days);

      const { uploaded, failures } = await uploadAll(
        picked.map((p) => ({ id: p.point.id, file: p.file })),
        event._id,
        () => latestToken.current ?? token,
        (done, total) => toast.loading(`Uploading ${Math.min(done + 1, total)} of ${total}…`, { id: toastId }),
      );

      const problems = [...skipped, ...failures];
      const moments = momentsFromPlan(await naming, uploaded, (id) => pickedOf.get(id)?.kind);
      // Media ids now on a saved moment; any other upload gets deleted.
      const used = new Set<string>();
      let created = 0;
      for (const [i, m] of moments.entries()) {
        toast.loading(`Creating moment ${i + 1} of ${moments.length}…`, { id: toastId });
        if (!m.create) {
          problems.push(`${m.label}: none of its photos uploaded`);
          continue;
        }
        try {
          const momentId = await createMoment({ eventId: event._id, ...m.create });
          created++;
          for (const u of m.uses) used.add(u.mediaId);
          enrichMoment(
            enrich,
            momentId,
            m.uses.flatMap((u) => {
              const p = pickedOf.get(u.photoId);
              return p ? [{ mediaId: u.mediaId, file: p.file }] : [];
            }),
          );
        } catch (e) {
          problems.push(`${m.label}: ${errorMessage(e)}`);
        }
      }

      const unused = [...uploaded.values()].filter((id) => !used.has(id));
      if (unused.length > 0) await deletePhotos(unused, latestToken.current ?? token);
      const added = `Added ${plural(created, "moment")}`;
      if (created === 0) {
        toast.error(`No moments were added · ${plural(problems.length, "problem")}`, { id: toastId, description: details(problems) });
      } else if (problems.length > 0) {
        toast.warning(`${added} · ${plural(problems.length, "problem")}`, { id: toastId, description: details(problems) });
      } else {
        toast.success(`${added} · writing the notes…`, { id: toastId });
      }
    } catch (e) {
      toast.error(errorMessage(e), { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={busy || !token}
        aria-label="Add photos and videos"
        onClick={() => input.current?.click()}
      >
        <ImagePlusIcon /> {children}
      </Button>
      <input
        ref={input}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        tabIndex={-1}
        // Visually hidden rather than display:none: some browsers won't click those.
        className="sr-only"
        onChange={(e) => {
          void addPhotos(e.target.files);
          // Cleared, so picking the same files again still fires.
          e.target.value = "";
        }}
      />
    </>
  );
}
