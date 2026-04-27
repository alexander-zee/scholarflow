"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Scroll-linked parallax: blobs, mesh, and diagonal bands move with scroll.
 * Sets --sf-scroll-y on <html> so tiled section backgrounds drift (globals.css).
 */
export default function LandingAmbientMist() {
  const meshId = useId().replace(/:/g, "");
  const rafRef = useRef<number | null>(null);
  const [y, setY] = useState(0);
  const [layerA, setLayerA] = useState(0.52);
  const [layerB, setLayerB] = useState(0.44);
  const [mesh, setMesh] = useState(0.38);
  const [meshB, setMeshB] = useState(0.28);

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const scrollY = window.scrollY;
      const doc = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = scrollY / doc;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setY(reduced ? 0 : scrollY);
      root.style.setProperty("--sf-scroll-y", reduced ? "0px" : `${scrollY}px`);
      if (!reduced) {
        setLayerA(0.32 + 0.48 * (0.5 + 0.5 * Math.sin(progress * Math.PI * 5.2 + 0.2)));
        setLayerB(0.26 + 0.52 * (0.5 + 0.5 * Math.cos(progress * Math.PI * 3.8 + 1.1)));
        setMesh(0.22 + 0.45 * (0.5 + 0.5 * Math.sin(progress * Math.PI * 6.5 - 0.4)));
        setMeshB(0.14 + 0.38 * (0.5 + 0.5 * Math.cos(progress * Math.PI * 4.2 + 0.9)));
      } else {
        setLayerA(0.48);
        setLayerB(0.4);
        setMesh(0.35);
        setMeshB(0.25);
      }
    };

    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        apply();
      });
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      root.style.removeProperty("--sf-scroll-y");
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[4] overflow-hidden" aria-hidden>
      <div
        className="absolute -left-[24%] top-[4%] h-[62vh] w-[78vw] will-change-transform rounded-[50%] bg-gradient-to-br from-sky-300/55 via-cyan-200/35 to-transparent blur-3xl transition-opacity duration-500 ease-out dark:from-sky-400/28 dark:via-cyan-400/18 dark:to-transparent"
        style={{
          opacity: layerA,
          transform: `translate3d(${y * 0.06}px, ${y * 0.14}px, 0)`,
        }}
      />
      <div
        className="absolute -right-[20%] bottom-[0%] h-[68vh] w-[72vw] will-change-transform rounded-[45%] bg-gradient-to-tl from-blue-300/45 via-sky-200/28 to-transparent blur-3xl transition-opacity duration-600 ease-out dark:from-blue-400/22 dark:via-sky-400/14 dark:to-transparent"
        style={{
          opacity: layerB,
          transform: `translate3d(${-y * 0.09}px, ${-y * 0.18}px, 0)`,
        }}
      />

      <div
        className="absolute -left-1/4 top-[-20%] h-[140vh] w-[55vw] will-change-transform opacity-[0.14] dark:opacity-[0.1]"
        style={{
          transform: `translate3d(${y * 0.11}px, ${y * 0.32}px, 0) rotate(-12deg)`,
          background:
            "repeating-linear-gradient(105deg, transparent 0px, transparent 36px, rgba(14,165,233,0.35) 36px, rgba(14,165,233,0.35) 37px)",
        }}
      />
      <div
        className="absolute -right-1/4 top-[10%] h-[130vh] w-[48vw] will-change-transform opacity-[0.11] dark:opacity-[0.08]"
        style={{
          transform: `translate3d(${-y * 0.13}px, ${y * 0.22}px, 0) rotate(8deg)`,
          background:
            "repeating-linear-gradient(-118deg, transparent 0px, transparent 44px, rgba(45,212,191,0.28) 44px, rgba(45,212,191,0.28) 45px)",
        }}
      />

      <svg
        className="absolute inset-0 h-full w-full will-change-transform dark:opacity-90"
        style={{
          opacity: mesh,
          transform: `translate3d(${y * 0.05}px, ${y * 0.1}px, 0)`,
        }}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id={`sf-mesh-${meshId}`} width="88" height="88" patternUnits="userSpaceOnUse">
            <path
              d="M0 44 Q22 10 44 44 T88 44 M44 0 Q72 22 44 44 T44 88"
              fill="none"
              stroke="rgba(14, 165, 233, 0.32)"
              strokeWidth="0.75"
            />
            <path
              d="M0 0 L88 88 M88 0 L0 88"
              fill="none"
              stroke="rgba(56, 189, 248, 0.14)"
              strokeWidth="0.5"
            />
            <circle cx="44" cy="44" r="3" fill="rgba(6, 182, 212, 0.2)" />
          </pattern>
          <pattern id={`sf-dots-${meshId}`} width="56" height="56" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="12" r="1.2" fill="rgba(14, 165, 233, 0.22)" />
            <circle cx="40" cy="36" r="1" fill="rgba(45, 212, 191, 0.18)" />
            <path d="M28 0v56M0 28h56" fill="none" stroke="rgba(125, 211, 252, 0.12)" strokeWidth="0.45" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#sf-mesh-${meshId})`} />
        <g style={{ opacity: meshB }}>
          <rect width="100%" height="100%" fill={`url(#sf-dots-${meshId})`} />
        </g>
      </svg>

      <div
        className="absolute bottom-[12%] left-[25%] h-48 w-[48%] will-change-transform rounded-full bg-gradient-to-r from-cyan-200/35 to-transparent blur-2xl transition-opacity duration-700 dark:from-cyan-400/18"
        style={{
          opacity: 0.45 + 0.35 * layerB,
          transform: `translate3d(${y * 0.04}px, ${-y * 0.07}px, 0)`,
        }}
      />
    </div>
  );
}
