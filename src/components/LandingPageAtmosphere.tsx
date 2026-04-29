"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Full-viewport background only: base + side stroke swirls + center read vignette.
 * All layers full-bleed (absolute inset-0 / fixed); no max-width on decorative layers.
 */
export default function LandingPageAtmosphere() {
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const layers = root.querySelectorAll<HTMLElement>("[data-parallax]");
    const onScroll = () => {
      const y = window.scrollY;
      layers.forEach((layer, i) => {
        const rate = 0.006 + i * 0.004;
        layer.style.transform = `translate3d(0, ${y * rate}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sideWave = `sfSideWave-${uid}`;
  const sideWaveR = `sfSideWaveR-${uid}`;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full overflow-hidden"
    >
      <div className="absolute inset-0 z-0 h-full w-full overflow-hidden">
        {/* Base — full bleed */}
        <div className="absolute inset-0 z-0 h-full w-full bg-[#020814]" />
        <div className="absolute inset-0 z-0 h-full w-full bg-gradient-to-b from-[#071a2e]/88 via-[#020814] to-[#01060d]" />

        {/* LEFT — edge swirls (positioned in outer strip only) */}
        <svg
          data-parallax
          className="will-change-transform absolute left-[-12vw] top-[8vh] z-0 h-[85vh] w-[38vw] opacity-[0.34] blur-[1px]"
          viewBox="0 0 400 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMinYMid meet"
        >
          <defs>
            <linearGradient id={sideWave} x1="0" y1="0" x2="400" y2="900">
              <stop stopColor="#67e8f9" stopOpacity="0" />
              <stop offset="0.42" stopColor="#22d3ee" stopOpacity="0.55" />
              <stop offset="1" stopColor="#0f766e" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M260 -40 C80 180 60 420 250 760"
            stroke={`url(#${sideWave})`}
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M320 -20 C130 220 100 500 330 880"
            stroke={`url(#${sideWave})`}
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.65"
          />
          <path
            d="M200 40 C40 260 40 520 190 820"
            stroke={`url(#${sideWave})`}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.55"
          />
          <path
            d="M140 20 C28 200 20 440 120 780"
            stroke={`url(#${sideWave})`}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.45"
          />
        </svg>

        {/* RIGHT — mirrored swirls */}
        <svg
          data-parallax
          className="will-change-transform absolute right-[-12vw] top-[8vh] z-0 h-[85vh] w-[38vw] -scale-x-100 opacity-[0.34] blur-[1px]"
          viewBox="0 0 400 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMinYMid meet"
        >
          <defs>
            <linearGradient id={sideWaveR} x1="0" y1="0" x2="400" y2="900">
              <stop stopColor="#7dd3fc" stopOpacity="0" />
              <stop offset="0.42" stopColor="#22d3ee" stopOpacity="0.52" />
              <stop offset="1" stopColor="#115e59" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M260 -40 C80 180 60 420 250 760"
            stroke={`url(#${sideWaveR})`}
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M320 -20 C130 220 100 500 330 880"
            stroke={`url(#${sideWaveR})`}
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.65"
          />
          <path
            d="M200 40 C40 260 40 520 190 820"
            stroke={`url(#${sideWaveR})`}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.55"
          />
          <path
            d="M140 20 C28 200 20 440 120 780"
            stroke={`url(#${sideWaveR})`}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.45"
          />
        </svg>

        {/* Center darkening — readable hero column; full viewport */}
        {/* Center read: strong mid column; outer ring fades so edge swirls stay visible */}
        <div className="absolute inset-0 z-0 h-full w-full bg-[radial-gradient(circle_at_center,rgba(2,8,20,0.86)_0%,rgba(2,8,20,0.38)_44%,rgba(2,8,20,0.12)_68%,transparent_100%)]" />
      </div>
    </div>
  );
}
