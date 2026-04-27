"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type LandingRevealProps = {
  children: ReactNode;
  /** Classes on the outer observer root (layout, bleed, etc.) */
  className?: string;
  /** Extra classes on the animated inner wrapper */
  innerClassName?: string;
};

/**
 * Scroll-triggered “jump out”: triggers once the block is well into the viewport,
 * then waits briefly so motion feels intentional (slower animation in globals).
 */
export default function LandingReveal({ children, className = "", innerClassName = "" }: LandingRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        if (delayRef.current) clearTimeout(delayRef.current);
        delayRef.current = setTimeout(() => {
          setActive(true);
          io.disconnect();
        }, 340);
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -22% 0px",
      },
    );

    io.observe(el);
    return () => {
      if (delayRef.current) clearTimeout(delayRef.current);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef} className={className}>
      <div className={`sf-landing-reveal-motion ${innerClassName} ${active ? "sf-landing-reveal-active" : ""}`}>
        {children}
      </div>
    </div>
  );
}
