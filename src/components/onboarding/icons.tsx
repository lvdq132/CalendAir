import type { SVGProps } from "react";

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
});

export const IconHelp = ({ size = 16 }: { size?: number }) => (
  <svg {...base(size)}>
    <circle cx={12} cy={12} r={9} />
    <path d="M9.4 9.2a2.7 2.7 0 1 1 3.4 3.1c-.6.2-.9.7-.9 1.3v.4" />
    <path d="M12 17.2h.01" />
  </svg>
);

export const IconClose = ({ size = 16 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconChevron = ({ size = 16 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconArrow = ({ size = 15 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);
