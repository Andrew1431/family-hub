import { useEffect, useRef, useState } from "react";
import { defineModule, type PanelProps, type SettingsProps } from "@hub/sdk";
import {
  FormFooter,
  LoadingState,
  Segmented,
  ToggleRow,
  useBackdropInk,
  useConfigDraft,
  useModuleConfig,
  usePhotoMode,
} from "@hub/components";
import { manifest } from "./manifest";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ClockConfig {
  showSeconds: boolean;
  hour12: boolean;
}

const DEFAULTS: ClockConfig = { showSeconds: true, hour12: true };

function ClockPanel(_props: PanelProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { showSeconds, hour12 } = useModuleConfig("clock", DEFAULTS);

  // Over the screensaver: ink flips to whatever contrasts with the photo behind
  // us, with a soft halo of the opposite tone for busy, mid-tone pictures.
  const rootRef = useRef<HTMLDivElement>(null);
  const { active: photo, anchor } = usePhotoMode();
  // Pinned to a right corner: hug the edge.
  const alignEnd = photo && anchor.endsWith("right");
  const ink = useBackdropInk(rootRef);
  const photoStyle = photo
    ? ({
        "--color-base-content": ink === "dark" ? "#141210" : "#fbf8f3",
        textShadow:
          ink === "dark"
            ? "0 0 18px rgba(255,255,255,0.45), 0 1px 2px rgba(255,255,255,0.35)"
            : "0 0 18px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.45)",
        transition: "color 700ms",
      } as React.CSSProperties)
    : undefined;

  const h24 = now.getHours();
  const hr = hour12 ? h24 % 12 || 12 : String(h24).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ampm = h24 >= 12 ? "PM" : "AM";

  return (
    <div
      ref={rootRef}
      className={`flex h-full flex-col justify-center ${alignEnd ? "items-end text-right" : ""}`}
      style={photoStyle}
    >
      <div className="flex items-end gap-3 leading-none">
        <span
          className="font-mono font-light tracking-tight text-base-content"
          style={{ fontSize: "clamp(56px, 9vw, 116px)" }}
        >
          {hr}:{m}
        </span>
        {(showSeconds || hour12) && (
          <span
            className="pb-[0.12em] font-mono font-light text-base-content/70"
            style={{ fontSize: "clamp(20px, 3.2vw, 40px)" }}
          >
            {showSeconds && s}
            {hour12 && (
              <span className={(showSeconds ? "ml-1 " : "") + "text-[0.55em] tracking-wide"}>{ampm}</span>
            )}
          </span>
        )}
      </div>
      <div
        className="mt-2 font-serif italic text-base-content/70"
        style={{ fontSize: "clamp(15px, 2vw, 22px)" }}
      >
        {DAYS[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
      </div>
    </div>
  );
}

function ClockSettings({ onClose }: SettingsProps) {
  const { draft, patch, save, saving } = useConfigDraft("clock", DEFAULTS);

  if (!draft) return <LoadingState />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-label mb-2">Hour format</div>
        <Segmented
          value={draft.hour12}
          options={[
            { value: true, label: "12-hour" },
            { value: false, label: "24-hour" },
          ]}
          onChange={(hour12) => patch({ hour12 })}
        />
      </div>

      <ToggleRow
        label="Show seconds"
        checked={draft.showSeconds}
        onChange={(showSeconds) => patch({ showSeconds })}
      />

      <FormFooter
        onCancel={onClose}
        onSave={() => void save().then(onClose)}
        saving={saving}
      />
    </div>
  );
}

export default defineModule({ manifest, Panel: ClockPanel, Settings: ClockSettings });
