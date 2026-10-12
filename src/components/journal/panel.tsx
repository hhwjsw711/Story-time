import { ArrowDownToLineIcon, ArrowUpToLineIcon, CopyIcon, LockIcon, PenLineIcon, ScissorsIcon, Trash2Icon, UnlockIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DECOS, type JournalElement, NOTE_STYLES, PAPERS, PRINT_STYLES, TITLE_STYLES } from "../../../convex/lib/journal";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { useMediaUrl } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";
import { type NewThing } from "./add";
import { Deco, Note, Title } from "./elements";
import { DECO_NAMES, FONTS, INK, NOTE_NAMES, PAPER_LOOKS, PRINT_NAMES, TITLE_NAMES } from "./look";

// The side of the journal: what you can put on a page, or, with something
// picked, what you can do with it.

const SECTION = "font-mono text-[11px] tracking-[0.14em] text-stone-500 uppercase";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-stone-300/70 px-3 py-3 last:border-b-0">
      <h3 className={SECTION}>{title}</h3>
      {children}
    </section>
  );
}

function Thumb({ mediaId, className }: { mediaId: string; className?: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt="" draggable={false} className={cn("size-full object-cover", className)} /> : <span className={cn("block size-full animate-pulse bg-stone-200", className)} />;
}

// A small drawing of a style, to pick it by sight.
function Sample({ children, label, on, onClick }: { children: ReactNode; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "relative grid h-16 place-items-center overflow-hidden rounded-md border bg-[#f3ead6] p-1 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#c4552f] focus-visible:outline-none",
        on ? "border-[#c4552f] ring-2 ring-[#c4552f]/40" : "border-stone-300",
      )}
    >
      {children}
    </button>
  );
}

const sample = (kind: JournalElement["kind"], style: string, text?: string): JournalElement => ({ id: `sample-${kind}-${style}`, kind, style, text, x: 0, y: 0, w: 120, h: 50, rotation: 0, z: 0 });

// Draws a title, note or bit at a small size inside a sample.
function Mini({ e, w, h }: { e: JournalElement; w: number; h: number }) {
  const scale = Math.min(118 / w, 56 / h);
  return (
    <div style={{ width: w * scale, height: h * scale }}>
      <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        {e.kind === "title" ? <Title e={{ ...e, w, h }} ink={INK} /> : e.kind === "note" ? <Note e={{ ...e, w, h }} /> : <Deco e={{ ...e, w, h }} />}
      </div>
    </div>
  );
}

// ---- What to add -----------------------------------------------------------------------

export function AddTray({
  moments,
  stickers,
  paper,
  onAdd,
  onPaper,
  onCut,
}: {
  moments: MomentView[];
  stickers: string[];
  paper: string;
  onAdd: (thing: NewThing) => void;
  onPaper: (paper: string) => void;
  onCut: () => void;
}) {
  const photos = moments.flatMap((m) => [m.blocks, ...m.stops.map((s) => s.blocks)].flat().flatMap((b) => (b.type === "photo" ? [b.mediaId as string] : [])));
  const mapped = moments.filter((m) => [m.geo, ...m.stops.map((s) => s.geo)].filter(Boolean).length >= 1);
  return (
    <div>
      <Section title="Words">
        <div className="grid grid-cols-2 gap-1.5">
          {TITLE_STYLES.map((s) => (
            <Sample key={s} label={`Add a ${TITLE_NAMES[s]} title`} onClick={() => onAdd({ kind: "title", style: s, text: "Our trip", w: 0, h: 0 })}>
              <Mini e={sample("title", s, s === "label" || s === "stamp" ? "Hello" : "Trip")} w={240} h={100} />
            </Sample>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {NOTE_STYLES.map((s) => (
            <Sample key={s} label={`Add a ${NOTE_NAMES[s]} note`} onClick={() => onAdd({ kind: "note", style: s, text: "", w: 0, h: 0 })}>
              <Mini e={sample("note", s, "Dear diary, today we…")} w={260} h={140} />
            </Sample>
          ))}
        </div>
      </Section>

      <Section title={`Photos · ${photos.length}`}>
        {photos.length === 0 ? (
          <p className="text-xs text-stone-500">Photos you add to moments show up here.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5">
            {photos.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  aria-label="Put this photo on the page"
                  onClick={() => onAdd({ kind: "photo", style: "polaroid", mediaId: id, w: 0, h: 0 })}
                  className="block aspect-square w-full overflow-hidden rounded-sm border-[3px] border-[#fffdf6] shadow-sm transition hover:-rotate-2 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#c4552f] focus-visible:outline-none"
                >
                  <Thumb mediaId={id} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Stickers · ${stickers.length}`}>
        <Button size="sm" variant="outline" className="w-full" onClick={onCut} disabled={photos.length === 0}>
          <ScissorsIcon aria-hidden /> Cut out a sticker
        </Button>
        {stickers.length > 0 && (
          <ul className="grid grid-cols-3 gap-1.5 pt-1">
            {stickers.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  aria-label="Put this sticker on the page"
                  onClick={() => onAdd({ kind: "sticker", mediaId: id, w: 0, h: 0 })}
                  className="grid aspect-square w-full place-items-center rounded-md bg-[#e9dfc8] p-1 transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-[#c4552f] focus-visible:outline-none"
                >
                  <span className="size-full" style={{ filter: "drop-shadow(1.5px 0 0 #fff) drop-shadow(-1.5px 0 0 #fff) drop-shadow(0 1.5px 0 #fff) drop-shadow(0 -1.5px 0 #fff)" }}>
                    <Thumb mediaId={id} className="object-contain" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Bits and pieces">
        <div className="grid grid-cols-3 gap-1.5">
          {DECOS.map((d) => (
            <Sample key={d} label={`Add ${DECO_NAMES[d]}`} onClick={() => onAdd({ kind: "deco", style: d, text: d === "ticket" ? "ADMIT ONE" : d === "postmark" ? "HELLO" : undefined, w: 0, h: 0 })}>
              <Mini e={sample("deco", d, d === "ticket" ? "ONE" : d === "postmark" ? "HI" : undefined)} w={d.startsWith("tape") ? 150 : d === "ticket" ? 250 : 120} h={d.startsWith("tape") ? 38 : d === "ticket" ? 100 : 120} />
            </Sample>
          ))}
        </div>
      </Section>

      {mapped.length > 0 && (
        <Section title="Maps">
          <ul className="space-y-1">
            {mapped.map((m) => (
              <li key={m._id}>
                <button
                  type="button"
                  onClick={() => onAdd({ kind: "map", momentId: m._id, w: 0, h: 0 })}
                  className="w-full truncate rounded-md border border-stone-300 bg-white/70 px-2 py-1.5 text-left text-xs hover:bg-white focus-visible:ring-2 focus-visible:ring-[#c4552f] focus-visible:outline-none"
                >
                  🗺 {m.place?.split(",")[0] ?? "A moment"} · {1 + m.stops.length} stops
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Paper">
        <div className="grid grid-cols-4 gap-1.5">
          {PAPERS.map((p) => (
            <button
              key={p}
              type="button"
              title={PAPER_LOOKS[p]!.name}
              aria-label={`${PAPER_LOOKS[p]!.name} paper`}
              aria-pressed={paper === p}
              onClick={() => onPaper(p)}
              className={cn("aspect-[3/4] rounded-sm border shadow-sm focus-visible:ring-2 focus-visible:ring-[#c4552f] focus-visible:outline-none", paper === p ? "border-[#c4552f] ring-2 ring-[#c4552f]/40" : "border-stone-300")}
              style={{ ...PAPER_LOOKS[p]!.style, backgroundSize: undefined }}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

// ---- What to do with the picked thing ------------------------------------------------------

const NAMES: Record<JournalElement["kind"], string> = { photo: "Photo", sticker: "Sticker", title: "Title", note: "Note", deco: "Decoration", map: "Map" };

export function Inspector({
  e,
  onChange,
  onWrite,
  onRestack,
  onDuplicate,
  onDelete,
  onCut,
}: {
  e: JournalElement;
  onChange: (change: Partial<JournalElement>) => void;
  onWrite: () => void;
  onRestack: (to: "front" | "back") => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCut: () => void;
}) {
  const name = e.kind === "deco" ? (DECO_NAMES[e.style ?? ""] ?? NAMES.deco) : NAMES[e.kind];
  return (
    <div>
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="text-2xl leading-none" style={{ fontFamily: FONTS.hand }}>
          {name}
        </h2>
        {e.locked && <LockIcon aria-label="Locked" className="size-4 text-stone-500" />}
      </div>

      {(e.kind === "title" || e.kind === "note" || (e.kind === "deco" && (e.style === "ticket" || e.style === "postmark"))) && (
        <Section title="Words">
          <textarea
            value={e.text ?? ""}
            maxLength={1000}
            rows={e.kind === "note" ? 4 : 2}
            disabled={e.locked}
            onChange={(ev) => onChange({ text: ev.target.value })}
            aria-label="Words"
            className="w-full resize-y rounded-md border border-stone-300 bg-white/80 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#c4552f]"
          />
          <p className="text-[11px] text-stone-500">Or double-click it on the page.</p>
        </Section>
      )}

      {e.kind === "title" && (
        <Section title="Style">
          <div className="grid grid-cols-2 gap-1.5">
            {TITLE_STYLES.map((s) => (
              <Sample key={s} label={TITLE_NAMES[s]!} on={(e.style ?? "typewriter") === s} onClick={() => onChange({ style: s })}>
                <Mini e={{ ...sample("title", s), text: (e.text ?? "").slice(0, 14) || "Title" }} w={240} h={100} />
              </Sample>
            ))}
          </div>
        </Section>
      )}

      {e.kind === "note" && (
        <Section title="Paper">
          <div className="grid grid-cols-2 gap-1.5">
            {NOTE_STYLES.map((s) => (
              <Sample key={s} label={NOTE_NAMES[s]!} on={(e.style ?? "typed") === s} onClick={() => onChange({ style: s })}>
                <Mini e={{ ...sample("note", s), text: (e.text ?? "").slice(0, 40) || "Dear diary…" }} w={260} h={140} />
              </Sample>
            ))}
          </div>
        </Section>
      )}

      {e.kind === "photo" && (
        <>
          <Section title="Print">
            <div className="flex flex-wrap gap-1">
              {PRINT_STYLES.map((s) => (
                <Button key={s} size="sm" variant={(e.style ?? "polaroid") === s ? "default" : "outline"} onClick={() => onChange({ style: s })}>
                  {PRINT_NAMES[s]}
                </Button>
              ))}
            </div>
          </Section>
          {(e.style ?? "polaroid") === "polaroid" && (
            <Section title="Caption">
              <input
                value={e.text ?? ""}
                maxLength={80}
                onChange={(ev) => onChange({ text: ev.target.value })}
                placeholder="Written under the photo"
                aria-label="Caption"
                className="w-full rounded-md border border-stone-300 bg-white/80 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#c4552f]"
              />
            </Section>
          )}
        </>
      )}

      {(e.kind === "photo" || e.kind === "sticker") && (
        <Section title="Tone">
          <div className="flex gap-1">
            {([[undefined, "Colour"], ["sepia", "Sepia"], ["mono", "Black & white"]] as const).map(([tone, label]) => (
              <Button key={label} size="sm" variant={e.tone === tone ? "default" : "outline"} onClick={() => onChange({ tone })}>
                {label}
              </Button>
            ))}
          </div>
          {e.kind === "photo" && (
            <Button size="sm" variant="outline" className="mt-1 w-full" onClick={onCut}>
              <ScissorsIcon aria-hidden /> Cut out a sticker
            </Button>
          )}
        </Section>
      )}

      {e.kind === "deco" && e.style?.startsWith("tape") && (
        <Section title="Tape">
          <div className="grid grid-cols-2 gap-1.5">
            {DECOS.filter((d) => d.startsWith("tape")).map((d) => (
              <Sample key={d} label={DECO_NAMES[d]!} on={e.style === d} onClick={() => onChange({ style: d })}>
                <Mini e={sample("deco", d)} w={150} h={38} />
              </Sample>
            ))}
          </div>
        </Section>
      )}
      {e.kind === "deco" && e.style?.startsWith("circle") && (
        <Section title="Colour">
          <div className="grid grid-cols-3 gap-1.5">
            {DECOS.filter((d) => d.startsWith("circle")).map((d) => (
              <Sample key={d} label={DECO_NAMES[d]!} on={e.style === d} onClick={() => onChange({ style: d })}>
                <Mini e={sample("deco", d)} w={120} h={120} />
              </Sample>
            ))}
          </div>
        </Section>
      )}

      <div className="flex flex-wrap gap-1 px-3 py-3">
        {e.kind !== "map" && e.kind !== "sticker" && e.kind !== "photo" && (
          <Button size="icon-sm" variant="outline" aria-label="Write" title="Write (double-click)" disabled={e.locked} onClick={onWrite}>
            <PenLineIcon aria-hidden />
          </Button>
        )}
        <Button size="icon-sm" variant="outline" aria-label="Bring to the front" title="Bring to the front (])" onClick={() => onRestack("front")}>
          <ArrowUpToLineIcon aria-hidden />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Send to the back" title="Send to the back ([)" onClick={() => onRestack("back")}>
          <ArrowDownToLineIcon aria-hidden />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Duplicate" title="Duplicate (⌘D)" onClick={onDuplicate}>
          <CopyIcon aria-hidden />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label={e.locked ? "Unlock it" : "Lock it in place"} title={e.locked ? "Unlock it" : "Lock it in place"} onClick={() => onChange({ locked: e.locked ? undefined : true })}>
          {e.locked ? <UnlockIcon aria-hidden /> : <LockIcon aria-hidden />}
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Delete" title="Delete" className="ml-auto text-destructive" onClick={onDelete}>
          <Trash2Icon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
