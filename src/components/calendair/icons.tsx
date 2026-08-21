import type { SVGProps } from "react";

type P = { size?: number } & SVGProps<SVGSVGElement>;

const stroke = (size: number, rest: SVGProps<SVGSVGElement>) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...rest,
});

/** The brand mark: a four-pointed star, always in gold. */
export const Star = ({ size = 18, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...rest}>
    <path d="M12 1.6c.62 5.6 4.8 9.78 10.4 10.4-5.6.62-9.78 4.8-10.4 10.4-.62-5.6-4.8-9.78-10.4-10.4C7.2 11.38 11.38 7.2 12 1.6Z" />
  </svg>
);

export const Bell = ({ size = 19, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
    <path d="M10.4 19a1.9 1.9 0 0 0 3.2 0" />
  </svg>
);

export const Pin = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M12 21.5s7-6.9 7-12a7 7 0 1 0-14 0c0 5.1 7 12 7 12Z" />
    <circle cx={12} cy={9.4} r={2.4} />
  </svg>
);

export const CalendarIcon = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <rect x={3.2} y={5} width={17.6} height={16} rx={3} />
    <path d="M3.2 9.6h17.6M8 3v4M16 3v4" />
  </svg>
);

export const CalendarCheck = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <rect x={3.2} y={5} width={17.6} height={16} rx={3} />
    <path d="M3.2 9.6h17.6M8 3v4M16 3v4M9 15.2l2.1 2.1 4-4.2" />
  </svg>
);

export const Clock = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <circle cx={12} cy={12} r={9} />
    <path d="M12 6.8V12l3.4 2.1" />
  </svg>
);

export const Plane = ({ size = 18, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...rest}>
    <path d="M21.6 12c0 .6-.5 1-1.1 1l-5.3.1-3.4 6.2a.8.8 0 0 1-.7.4h-1.3c-.4 0-.7-.4-.6-.8l1.6-5.8-4 .1-1.3 2a.7.7 0 0 1-.6.3H2.7c-.4 0-.7-.4-.6-.8L3 12l-.9-2.5c-.1-.4.2-.8.6-.8h1.2c.2 0 .5.1.6.3l1.3 2 4 .1-1.6-5.8c-.1-.4.2-.8.6-.8h1.3c.3 0 .6.1.7.4l3.4 6.2 5.3.1c.6 0 1.1.4 1.1 1Z" />
  </svg>
);

export const Shield = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M12 2.8 4.8 5.6v6c0 4.4 3 8.4 7.2 9.6 4.2-1.2 7.2-5.2 7.2-9.6v-6L12 2.8Z" />
  </svg>
);

export const ShieldCheck = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M12 2.8 4.8 5.6v6c0 4.4 3 8.4 7.2 9.6 4.2-1.2 7.2-5.2 7.2-9.6v-6L12 2.8Z" />
    <path d="M9.1 11.9 11.3 14l3.8-4" />
  </svg>
);

export const Users = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <circle cx={9} cy={8.2} r={3.4} />
    <path d="M2.8 20c.6-3.3 3.2-5.4 6.2-5.4s5.6 2.1 6.2 5.4" />
    <path d="M16.2 5.2a3.4 3.4 0 0 1 0 6.4M17.4 14.9c2.1.6 3.6 2.5 4 5.1" />
  </svg>
);

export const Check = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)} strokeWidth={2}>
    <path d="M5 12.6 9.6 17 19 7.4" />
  </svg>
);

export const ChevronRight = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M9 5.5 15.5 12 9 18.5" />
  </svg>
);

export const ChevronLeft = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M15 5.5 8.5 12 15 18.5" />
  </svg>
);

export const ChevronDown = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M5.5 9 12 15.5 18.5 9" />
  </svg>
);

export const ArrowRight = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5" />
  </svg>
);

export const Heart = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M12 20.3s-7.6-4.6-7.6-9.6a4.3 4.3 0 0 1 7.6-2.7 4.3 4.3 0 0 1 7.6 2.7c0 5-7.6 9.6-7.6 9.6Z" />
  </svg>
);

export const TrendUp = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M3.5 16.6 9 11l3.4 3.4 7-7.4" />
    <path d="M15 7h4.8v4.8" />
  </svg>
);

export const Wallet = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <rect x={2.8} y={6} width={18.4} height={13} rx={3} />
    <path d="M2.8 10.4h18.4M16.6 14.6h1.6" />
  </svg>
);

export const Ticket = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M3 9.4V7.6A1.6 1.6 0 0 1 4.6 6h14.8A1.6 1.6 0 0 1 21 7.6v1.8a2.6 2.6 0 0 0 0 5.2v1.8a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 16.4v-1.8a2.6 2.6 0 0 0 0-5.2Z" />
  </svg>
);

export const Refresh = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M20.4 11.4a8.4 8.4 0 1 1-2.5-5.6" />
    <path d="M20.6 3.6v5h-5" />
  </svg>
);

export const Share = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M12 15.4V3.6M8 7.2 12 3.2l4 4" />
    <path d="M4.8 13.6v5.2a1.8 1.8 0 0 0 1.8 1.8h10.8a1.8 1.8 0 0 0 1.8-1.8v-5.2" />
  </svg>
);

export const Sun = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <circle cx={12} cy={12} r={4.2} />
    <path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6" />
  </svg>
);

export const Lock = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <rect x={4.6} y={10.4} width={14.8} height={10} rx={3} />
    <path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" />
  </svg>
);

export const Activity = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <path d="M2.8 12h4l2.4-6.6 4.4 13L16.4 12h4.8" />
  </svg>
);

export const Settings = ({ size = 18, ...rest }: P) => (
  <svg {...stroke(size, rest)}>
    <circle cx={12} cy={12} r={3.2} />
    <path d="M19.6 14.4a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2v.17a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-2.96-1.13l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3.7 14.4H3.5a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.72 7.4l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 2.9-1.2V3.2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 2.9 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.28 1.98v.09a1.7 1.7 0 0 0 1.55.99h.17a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </svg>
);
