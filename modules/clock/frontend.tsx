import { useEffect, useState } from "react";
import { defineModule, type PanelProps } from "@hub/sdk";
import { manifest } from "./manifest";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ClockPanel(_props: PanelProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ampm = now.getHours() >= 12 ? "PM" : "AM";
  const hr = now.getHours() % 12 || 12;

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="flex items-end gap-3 leading-none">
        <span
          className="font-mono font-light tracking-tight text-base-content"
          style={{ fontSize: "clamp(56px, 9vw, 116px)" }}
        >
          {hr}:{m}
        </span>
        <span
          className="font-mono font-light text-base-content/70 pb-[0.12em]"
          style={{ fontSize: "clamp(20px, 3.2vw, 40px)" }}
        >
          {s}
          <span className="ml-1 text-[0.55em] tracking-wide">{ampm}</span>
        </span>
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

export default defineModule({ manifest, Panel: ClockPanel });
