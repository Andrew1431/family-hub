import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PanelProps } from "@hub/sdk";
import { CONFIG_DEFAULTS, fetchPhotoConfig, fetchPhotos } from "./types";
import { Slideshow } from "./Slideshow";

function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full w-full place-items-center bg-base-content/[0.04] p-6 text-center">
      <p className="max-w-[22ch] font-serif text-[clamp(13px,1.5vw,16px)] italic text-base-content/55">
        {children}
      </p>
    </div>
  );
}

export function PhotosPanel({ instanceId }: PanelProps) {
  const photosQuery = useQuery({
    queryKey: ["photos", "list", instanceId],
    queryFn: () => fetchPhotos(instanceId),
    refetchInterval: 5 * 60_000,
  });
  const { data: config } = useQuery({ queryKey: ["photos", "config"], queryFn: fetchPhotoConfig });
  const intervalSec = config?.intervalSec ?? CONFIG_DEFAULTS.intervalSec;

  const result = photosQuery.data;

  let body: ReactNode;
  if (photosQuery.isLoading) {
    body = (
      <div className="grid h-full w-full place-items-center bg-black">
        <span className="loading loading-ring loading-lg text-primary/60" />
      </div>
    );
  } else if (!result || !result.ok) {
    const reason = result?.reason;
    body = (
      <Hint>
        {reason === "not-connected"
          ? "Connect a Google Drive account in Settings to show your photos here."
          : reason === "no-folder"
            ? "Pick a Drive folder in Settings to start the slideshow."
            : (result?.error ?? "Couldn’t load photos.")}
      </Hint>
    );
  } else if (result.photos.length === 0) {
    body = <Hint>No images found in “{result.folder?.name}”.</Hint>;
  } else {
    body = <Slideshow photos={result.photos} intervalSec={intervalSec} />;
  }

  // Bare surface: the Panel owns its rounded frame + subtle ring.
  return (
    <div className="h-full w-full overflow-hidden rounded-[clamp(12px,1.4vw,20px)] ring-1 ring-base-content/10">
      {body}
    </div>
  );
}
