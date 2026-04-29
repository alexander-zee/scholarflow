import type { ReactNode } from "react";
import { landingFeaturePanelCard } from "@/lib/landing-ui";

/**
 * Paired home feature panels: shared card chrome + internal underglow / top shine.
 */
export default function LandingFeaturePanelShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${landingFeaturePanelCard} sf-landing-panel-depth`}>
      <div className="sf-landing-panel-depth__underglow" aria-hidden />
      <div className="sf-landing-panel-depth__topshine" aria-hidden />
      <div className="sf-landing-panel-depth__body">{children}</div>
    </div>
  );
}
