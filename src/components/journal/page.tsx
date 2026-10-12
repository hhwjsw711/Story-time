import { forwardRef, type ReactNode } from "react";
import { type JournalElement, PAGE } from "../../../convex/lib/journal";
import type { MomentView } from "@/components/event/types";
import { cn } from "@/lib/utils";
import { ElementView, elementBox, HeartClip } from "./elements";
import { paperLook } from "./look";

export type PageData = { _id: string; paper: string; locked: boolean; momentId?: string; elements: JournalElement[] };

// One A4 page, drawn at `scale`: its paper and everything on it, back to front.
// `children` sit on top in page units (the editor's handles and text box).
export const JournalPage = forwardRef<
  HTMLDivElement,
  {
    page: Pick<PageData, "paper" | "elements">;
    moments: ReadonlyMap<string, MomentView>;
    scale: number;
    // Maps can be played and photos shown at full size; off in thumbnails.
    live?: boolean;
    // Being read: links open.
    reading?: boolean;
    className?: string;
    children?: ReactNode;
  }
>(function JournalPage({ page, moments, scale, live = true, reading = false, className, children }, ref) {
  const look = paperLook(page.paper);
  const elements = [...page.elements].sort((a, b) => a.z - b.z);
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: PAGE.w * scale, height: PAGE.h * scale }}>
      <div
        ref={ref}
        data-journal-page
        className="paper-scope absolute top-0 left-0 overflow-hidden"
        style={{ ...look.style, width: PAGE.w, height: PAGE.h, transform: `scale(${scale})`, transformOrigin: "0 0", color: look.ink }}
      >
        <HeartClip />
        {elements.map((e) => (
          <div key={e.id} data-el={e.id} style={elementBox(e)}>
            {e.kind === "map" && !live ? (
              <div className="size-full bg-[#fffdf6] p-2">
                <div className="grid size-full place-items-center bg-[#dfe7df] text-stone-500">map</div>
              </div>
            ) : (
              <ElementView e={e} ink={look.ink} moment={e.momentId ? moments.get(e.momentId) : undefined} interactive={reading} />
            )}
          </div>
        ))}
        {children}
      </div>
    </div>
  );
});
