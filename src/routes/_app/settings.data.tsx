import { createFileRoute } from "@tanstack/react-router";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";

export const Route = createFileRoute("/_app/settings/data")({ component: DataSettings });

function DataSettings() {
  return (
    <SettingsPage title="Data & privacy" description="What we keep, and what leaves your browser to make the app work.">
      <div className="space-y-10">
        <SettingsBlock title="What we store">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>What you add: profile fields, moments, notes, links, photos and videos.</li>
            <li>Place, notes and links are encrypted before they are saved.</li>
            <li>Photos are encrypted in storage and visible only to people you share with — or to anyone holding a link you switched on.</li>
            <li>JPEG photos lose the details the camera saved in them, like where they were taken, when they're added. Other photos and videos keep theirs.</li>
            <li>
              When you add photos, small copies of up to four photos from each moment go through Convex's AI gateway to
              Anthropic to draft the first note and labels; the copies aren't kept.
            </li>
            <li>
              Place search and the names of photo locations use OpenStreetMap data from photon.komoot.io; your typed text
              or the photo's coordinates are sent to it.
            </li>
            <li>
              When a story goes by foot, bike, car, bus or train, its map draws the leg along real streets and tracks.
              Whoever is watching, a shared link included, asks OpenStreetMap's public routers for it and sends only the
              two stops' coordinates, rounded to about 100 m; nothing is stored. If they can't be reached, the leg is a curve.
            </li>
            <li>Nothing is copied from your GitHub or Google account.</li>
          </ul>
        </SettingsBlock>
      </div>
    </SettingsPage>
  );
}
