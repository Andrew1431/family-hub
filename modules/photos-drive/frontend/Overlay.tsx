import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OverlayProps } from "@hub/sdk";
import { CONFIG_DEFAULTS, fetchPhotoConfig, fetchScreensaverPhotos } from "./types";
import { Slideshow, type SlideshowHandle } from "./Slideshow";

/**
 * The shell mounts this permanently and feeds it the global idle time. When the
 * screensaver is enabled, there are photos, and we've been idle past the
 * configured threshold, the slideshow takes over the whole screen. The shell
 * resets `idleMs` on any interaction, which hides us again (and swallows that
 * first wake event so it doesn't open the assistant).
 */
export function PhotosOverlay({ idleMs, setActive, setKeyHandler }: OverlayProps) {
  const show = useRef<SlideshowHandle>(null);
  const { data: config } = useQuery({ queryKey: ["photos", "config"], queryFn: fetchPhotoConfig });
  const { data: result } = useQuery({
    queryKey: ["photos", "screensaver"],
    queryFn: fetchScreensaverPhotos,
    refetchInterval: 5 * 60_000,
  });

  const enabled = config?.screensaver ?? CONFIG_DEFAULTS.screensaver;
  const idleSec = Math.max(10, config?.idleSec ?? CONFIG_DEFAULTS.idleSec);
  const intervalSec = config?.intervalSec ?? CONFIG_DEFAULTS.intervalSec;
  const photos = result?.ok ? result.photos : [];

  const active = enabled && photos.length > 0 && idleMs >= idleSec * 1000;

  useEffect(() => {
    setActive(active);
    return () => setActive(false);
  }, [active, setActive]);

  // ←/→ browse while the screensaver stays up; any other key wakes as usual.
  useEffect(() => {
    if (!active) return;
    setKeyHandler((e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return false;
      show.current?.step(e.key === "ArrowRight" ? 1 : -1);
      return true;
    });
    return () => setKeyHandler(null);
  }, [active, setKeyHandler]);

  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <Slideshow ref={show} photos={photos} intervalSec={intervalSec} resumeKey="screensaver" />
    </div>
  );
}
