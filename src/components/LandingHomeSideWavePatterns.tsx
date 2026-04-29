import { type CSSProperties, useId } from "react";

const PATH_TEMPLATES = [
  "M 0 700 C 140 610, 230 500, 310 380 C 390 250, 470 130, 620 40",
  "M -40 730 C 120 640, 215 520, 295 400 C 375 270, 455 150, 610 70",
  "M -80 760 C 95 665, 200 545, 285 420 C 365 295, 445 175, 600 95",
] as const;

/** 1.2–2.0, varied so no single line dominates */
const STROKE_WIDTHS = [
  1.35, 1.55, 1.2, 1.75, 1.45, 1.9, 1.25, 1.65, 1.5, 2.0, 1.3, 1.6, 1.85, 1.4, 1.7, 1.22, 1.95, 1.52, 1.28, 1.8, 1.38, 1.62, 1.48, 1.72,
];

function strokeOpacityFor(i: number): number {
  const v = 0.16 + (i % 10) * 0.02 + (i % 4) * 0.015;
  return Math.min(0.38, Math.max(0.16, v));
}

const PATH_COUNT = 24;

/** Small x jitter in [-20, 20] */
function offsetX(i: number): number {
  return (i % 5) * 10 - 20;
}

/**
 * Side contour waves — absolute in main (scrolls with page), below z-10 content.
 */
export default function LandingHomeSideWavePatterns() {
  const id = useId().replace(/:/g, "");
  const gradL = `sf-side-wave-grad-l-${id}`;
  const gradR = `sf-side-wave-grad-r-${id}`;

  const paths = Array.from({ length: PATH_COUNT }, (_, i) => ({
    d: PATH_TEMPLATES[i % PATH_TEMPLATES.length],
    transform: `translate(${offsetX(i)}, ${-10 * i})`,
    strokeWidth: STROKE_WIDTHS[i % STROKE_WIDTHS.length],
    strokeOpacity: strokeOpacityFor(i),
  }));

  const maskL = "linear-gradient(to right, black 0%, black 75%, transparent 100%)";
  const maskR = "linear-gradient(to left, black 0%, black 75%, transparent 100%)";

  const maskStyleL: CSSProperties = {
    maskImage: maskL,
    WebkitMaskImage: maskL,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
  };

  const maskStyleR: CSSProperties = {
    maskImage: maskR,
    WebkitMaskImage: maskR,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
  };

  const svgMotion =
    "h-full w-full animate-[waveDrift_18s_ease-in-out_infinite_alternate] motion-reduce:animate-none will-change-transform";

  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden>
      <div className="absolute left-[-140px] top-[88px] h-[480px] w-[340px] rounded-full bg-cyan-500/[0.06] blur-[90px]" />
      <div className="absolute right-[-140px] top-[88px] h-[480px] w-[340px] rounded-full bg-sky-500/[0.055] blur-[90px]" />

      <div
        className="pointer-events-none absolute left-[-160px] top-[90px] h-[760px] w-[620px] opacity-55 [mask-image:linear-gradient(to_right,black_0%,black_75%,transparent_100%)]"
        style={maskStyleL}
      >
        <svg
          className={`${svgMotion} overflow-visible`}
          viewBox="0 0 620 760"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradL} x1="0%" y1="100%" x2="85%" y2="5%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
              <stop offset="42%" stopColor="#38bdf8" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g fill="none">
            {paths.map((p, i) => (
              <path
                key={`l-${i}`}
                d={p.d}
                transform={p.transform}
                stroke={`url(#${gradL})`}
                strokeWidth={p.strokeWidth}
                strokeLinecap="round"
                strokeOpacity={p.strokeOpacity}
              />
            ))}
          </g>
        </svg>
      </div>

      <div
        className="pointer-events-none absolute right-[-160px] top-[90px] h-[760px] w-[620px] scale-x-[-1] opacity-45 [mask-image:linear-gradient(to_left,black_0%,black_75%,transparent_100%)]"
        style={maskStyleR}
      >
        <svg
          className={`${svgMotion} overflow-visible`}
          viewBox="0 0 620 760"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradR} x1="0%" y1="100%" x2="85%" y2="5%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
              <stop offset="44%" stopColor="#7dd3fc" stopOpacity="0.52" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g fill="none">
            {paths.map((p, i) => (
              <path
                key={`r-${i}`}
                d={p.d}
                transform={`translate(${offsetX(i + 2)}, ${-10 * i})`}
                stroke={`url(#${gradR})`}
                strokeWidth={STROKE_WIDTHS[(i + 5) % STROKE_WIDTHS.length]}
                strokeLinecap="round"
                strokeOpacity={strokeOpacityFor(i + 1)}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
