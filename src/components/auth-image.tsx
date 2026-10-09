import { useMediaUrl } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";

// Photos are private, so they load with the viewer's token and are shown
// from a blob URL instead of a public link. `className` reshapes all three
// states (e.g. a square thumbnail).
export function AuthImage({ mediaId, alt, className }: { mediaId: string; alt: string; className?: string }) {
  const { url, failed } = useMediaUrl(mediaId);

  if (failed) {
    return (
      <div className={cn("grid aspect-video place-items-center rounded-md bg-muted text-xs text-muted-foreground", className)}>
        Photo unavailable
      </div>
    );
  }
  if (!url) return <div className={cn("aspect-video animate-pulse rounded-md bg-muted", className)} />;
  return <img src={url} alt={alt} className={cn("aspect-video w-full rounded-md object-cover", className)} />;
}

// Videos load the same way. ponytail: the whole file is fetched before it
// plays (no range requests); fine at the 50 MB cap, stream via signed URLs
// if longer videos are ever allowed.
export function AuthVideo({ mediaId, label }: { mediaId: string; label: string }) {
  const { url, failed } = useMediaUrl(mediaId);

  if (failed) {
    return (
      <div className="grid aspect-video place-items-center rounded-md bg-muted text-xs text-muted-foreground">
        Video unavailable
      </div>
    );
  }
  if (!url) return <div className="aspect-video animate-pulse rounded-md bg-muted" />;
  return <video src={url} controls preload="metadata" aria-label={label} className="aspect-video w-full rounded-md bg-black" />;
}
