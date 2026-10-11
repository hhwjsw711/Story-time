import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { RegionForm } from "@/components/settings/region-form";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/settings/data")({ component: DataSettings });

function DataSettings() {
  const user = useQuery(api.users.getCurrentUser);

  return (
    <SettingsPage
      title="Data & region"
      description="Pick a preferred region, and see what we keep. For now everything is stored in one place."
    >
      <div className="space-y-10">
        <SettingsBlock title="Region">
          {user === undefined ? (
            <Skeleton className="h-32 w-full" />
          ) : user === null ? null : (
            <RegionForm region={user.region} />
          )}
        </SettingsBlock>
        <hr />
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
            <li>Nothing is copied from your GitHub or Google account.</li>
          </ul>
        </SettingsBlock>
      </div>
    </SettingsPage>
  );
}
