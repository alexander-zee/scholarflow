import LandingAcademicBackdrop from "@/components/LandingAcademicBackdrop";
import PricingComparison from "@/components/PricingComparison";
import { landingMax } from "@/lib/landing-ui";

export default function PricingPage() {
  return (
    <div className="relative min-h-[calc(100dvh-4.5rem)] overflow-hidden bg-slate-100 dark:bg-[#030712]">
      <LandingAcademicBackdrop />
      <main className={`relative z-10 ${landingMax} pb-24 pt-10 md:pb-28 md:pt-14`}>
        <PricingComparison proCtaHref="/billing" titleLevel="h1" />
      </main>
    </div>
  );
}
