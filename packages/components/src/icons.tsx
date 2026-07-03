import type { SVGProps } from "react";

/**
 * Shared stroke-icon set. One tiny hand-drawn set (24×24, currentColor stroke)
 * so every panel and the shell draw from the same visual vocabulary — no more
 * per-file pasted <svg> paths. Size with the `size` prop; colour via CSS.
 */

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  size?: number;
  /** Stroke width override — the set defaults to 2. */
  weight?: number;
}

function makeIcon(children: React.ReactNode, defaultWeight = 2) {
  return function Icon({ size = 16, weight = defaultWeight, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...rest}
      >
        {children}
      </svg>
    );
  };
}

export const IconGear = makeIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
);

export const IconPlus = makeIcon(<path d="M12 5v14M5 12h14" />);
export const IconX = makeIcon(<path d="M6 6l12 12M18 6L6 18" />);
export const IconCheck = makeIcon(<path d="M4.5 12.5l5 5 10-11" />);
export const IconRefresh = makeIcon(<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />);
export const IconChevronLeft = makeIcon(<path d="M15 5l-7 7 7 7" />);
export const IconChevronRight = makeIcon(<path d="M9 5l7 7-7 7" />);
export const IconArrowLeft = makeIcon(<path d="M19 12H5m6-7l-7 7 7 7" />);
export const IconCalendar = makeIcon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </>,
);
export const IconRows = makeIcon(<path d="M4 6h16M4 12h16M4 18h16" />);
export const IconTabs = makeIcon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18" />
  </>,
);
export const IconSun = makeIcon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);
export const IconMoon = makeIcon(<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />);
export const IconSparkle = makeIcon(
  <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
  1.6,
);
