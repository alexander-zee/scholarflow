import Link from "next/link";
import LandingPricingSection from "@/components/LandingPricingSection";
import LandingProductPreview from "@/components/LandingProductPreview";
import LandingReveal from "@/components/LandingReveal";
import LandingFullThesisFeaturePanel from "@/components/LandingFullThesisFeaturePanel";
import LandingThesisFlowVisual from "@/components/LandingThesisFlowVisual";
import LandingHowItWorks from "@/components/LandingHowItWorks";
import LandingTwoUpVisualFeatureCards from "@/components/LandingTwoUpVisualFeatureCards";
import SiteMarketingFooter from "@/components/SiteMarketingFooter";
import SupportChatBubble from "@/components/SupportChatBubble";
import {
  landingGlassCard,
  landingH2,
  landingLead,
  landingMax,
  landingPrimaryCta,
  landingSecondaryCta,
} from "@/lib/landing-ui";

const faqs: { q: string; a: string }[] = [
  {
    q: "Can I control the target length of my draft?",
    a: "Yes. You can steer scope by refining outline sections and iterating in the writing studio. ThesisPilot is designed for staged drafting and revision, so you can expand or compress sections before final export.",
  },
  {
    q: "Can I upload my own references and cite them?",
    a: "Yes. Upload PDFs or text-based documents to your project first; ThesisPilot uses those sources to shape outlines and draft scaffolding. Stronger citations depend on clean, extractable source text.",
  },
  {
    q: "What exports are available?",
    a: "You can export to PDF, print, plain text, Markdown, and LaTeX. If you need Word, the current path is exporting plain text/Markdown/LaTeX and converting in your preferred editor.",
  },
  {
    q: "How is this different from a generic AI chat?",
    a: "ThesisPilot is project-based: references, outline, generated draft sections, structured review, anchored comments, and supervisor chat in one workflow. It is built for long-form thesis iteration, not one-off prompts.",
  },
  {
    q: "Does ThesisPilot guarantee AI-detection bypass?",
    a: "No. ThesisPilot is a revision and learning workspace, not a bypass tool. You should treat outputs as editable scaffolding and submit only work you understand and can defend.",
  },
  {
    q: "Which languages are supported?",
    a: "You can set a project language and prompts/outputs follow that setting. Quality varies by language; English is typically strongest with current models.",
  },
  {
    q: "What if my PDF does not extract correctly?",
    a: "Some PDFs are scans and contain little machine-readable text. In that case, use OCR or upload text-native PDFs/DOCX so ThesisPilot can properly index and use the source.",
  },
  {
    q: "How do review limits work?",
    a: "Outline generation, full-draft generation, structured reviews, and supervisor chat consume monthly AI allowance. Limits depend on your plan and reset each billing cycle.",
  },
];

export default function Home() {
  return (
    <section
      className="relative min-h-screen overflow-x-hidden bg-white bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('/thesispilot-wave-bg.png')",
        backgroundPosition: "center top",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-white/20" aria-hidden />
      <div className="relative z-10 min-h-screen">
        <main className="relative z-0 flex min-h-screen w-full flex-col overflow-x-hidden bg-transparent text-[#071A3A] dark:text-slate-100">
          <div className="relative z-10 flex-1 space-y-8 md:space-y-10">
            {/* Hero — full-bleed section; content centered inside landingMax */}
            <LandingReveal>
              <section className="relative w-full overflow-x-hidden bg-transparent py-12 md:py-14 lg:min-h-[min(84vh,880px)] lg:py-16">
                <div className={`${landingMax} relative z-10`}>
                  <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-10 lg:min-h-[min(520px,58vh)]">
                    <div className="min-w-0 max-w-xl">
                      <h1 className="max-w-xl text-pretty text-4xl font-bold leading-[1.08] tracking-[-0.025em] text-[#071A3A] dark:text-white sm:text-5xl sm:leading-[1.06] md:text-6xl md:leading-[1.04] lg:text-[3.5rem] lg:leading-[1.03]">
                        Finish your thesis with{" "}
                        <span className="text-[#176BFF] dark:text-[#5B9DFF]">AI supervision</span>.
                      </h1>
                      <p className="mt-7 max-w-xl text-pretty text-lg font-normal leading-relaxed text-[#52627A] dark:text-slate-400/88 md:mt-9 md:text-xl md:leading-relaxed">
                        From econometrics chapters to supervisor rounds — ThesisPilot outlines, drafts, and reviews in one workspace so you{" "}
                        <span className="box-decoration-clone rounded-md bg-[#E8F0FF]/95 px-1.5 py-0.5 font-medium text-[#071A3A] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-[#176BFF]/25 dark:bg-slate-800/95 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:ring-white/12">
                          keep authorship and control exports
                        </span>
                        .
                      </p>
                      <div className="mt-11 flex flex-wrap items-center gap-4 md:mt-14">
                        <Link href="/auth/signup" className={landingPrimaryCta}>
                          <span>Get started — it&apos;s free</span>
                        </Link>
                        <Link href="/auth/signin" className={landingSecondaryCta}>
                          Sign in
                        </Link>
                      </div>
                    </div>

                    <div className="flex min-h-0 min-w-0 w-full justify-end lg:min-h-[min(36rem,62vh)]">
                      <div className="w-full max-w-xl lg:max-w-none">
                        <LandingProductPreview className="h-full w-full min-w-0" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </LandingReveal>

            {/* Trust strip — headline + subheadline only */}
            <LandingReveal>
              <section className="relative w-full bg-transparent py-8 md:py-10">
                <div className={`${landingMax} text-center`}>
                  <h2 className="mx-auto max-w-[44rem] text-4xl font-bold leading-[1.08] tracking-tight text-[#071A3A] dark:text-white sm:text-5xl sm:leading-[1.06] md:text-6xl md:leading-[1.05] lg:text-[3.5rem] lg:leading-[1.04]">
                    Your thesis, supervised from start to finish
                  </h2>
                  <p className="mx-auto mt-4 max-w-2xl text-lg font-normal leading-snug text-[#52627A] dark:text-slate-400 md:mt-5 md:text-xl md:leading-relaxed">
                    ThesisPilot puts your draft and supervisor feedback in one place with exports you control until submission.
                  </p>
                </div>
              </section>
            </LandingReveal>

            {/* Feature system: two full-width panels, then two-up row (wide / wide / grid) */}
            <LandingReveal>
              <section className="relative border-t border-[#D9E8FF] py-12 dark:border-white/[0.04] md:py-14">
                <div className="mx-auto w-full max-w-6xl space-y-8 px-6">
                  <LandingThesisFlowVisual />
                  <LandingFullThesisFeaturePanel />
                  <LandingTwoUpVisualFeatureCards />
                </div>
              </section>
            </LandingReveal>

            {/* How it works — premium step row, Lucide orbs */}
            <LandingReveal>
              <LandingHowItWorks />
            </LandingReveal>

            {/* vs generic */}
            <LandingReveal>
              <section className="border-t border-[#D9E8FF] py-12 text-[#071A3A] dark:border-white/[0.04] dark:text-white md:py-14">
                <div className={landingMax}>
                  <h2 className={`${landingH2} text-center`}>ThesisPilot vs generic chat</h2>
                  <p className={`${landingLead} mx-auto mt-4 max-w-2xl text-center`}>
                    Generic tools optimize for short messages. ThesisPilot optimizes for long-form academic iteration: structure, evidence,
                    and repeatable review.
                  </p>
                  <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-6">
                    <div className={`${landingGlassCard} p-7 md:p-8`}>
                      <p className="text-xs font-bold uppercase tracking-widest text-[#176BFF] dark:text-sky-300/90">ThesisPilot</p>
                      <ul className="mt-5 space-y-3 text-sm leading-[1.6] text-[#52627A] dark:text-slate-200/95">
                        <li>• Project memory + reference uploads</li>
                        <li>• Outline + draft sections you can export</li>
                        <li>• Structured review + anchored jump-to-text</li>
                        <li>• Cost-capped supervisor chat</li>
                      </ul>
                    </div>
                    <div className={`${landingGlassCard} border-[#E2E8F0] bg-[#F8FAFC]/90 p-7 hover:border-[#CBD5E1] md:p-8 dark:border-white/[0.08] dark:bg-white/[0.035] dark:hover:border-white/12 dark:supports-[backdrop-filter]:bg-white/[0.025]`}>
                      <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8]">Generic chat</p>
                      <ul className="mt-5 space-y-3 text-sm leading-[1.6] text-[#64748B] dark:text-slate-400">
                        <li>• Easy to lose thread across long drafts</li>
                        <li>• Weak guarantees on citations and evidence</li>
                        <li>• Hard to keep a repeatable thesis workflow</li>
                        <li>• Often pushes long ghostwritten blocks</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            </LandingReveal>

            {/* Studio strip */}
            <LandingReveal>
              <section className={`${landingMax} border-t border-[#D9E8FF] py-10 dark:border-white/[0.04] md:py-12`}>
                <h2 className={landingH2}>Writing studio + AI supervisor</h2>
                <p className={landingLead}>
                  Draft on the left. On the right: structured reviews, anchored comments, and short supervisor chat tuned for the{" "}
                  <strong className="font-medium text-[#071A3A] dark:text-slate-300">next best action</strong> — like a supervisor corridor conversation.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-6 md:mt-8 lg:grid-cols-[1.4fr_1fr] lg:gap-6">
                  <div className={`${landingGlassCard} p-6 md:p-7`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#176BFF] dark:text-sky-400/90">Draft editor</p>
                    <p className="mt-5 rounded-xl border border-[#D9E8FF] bg-[#F5FAFF]/95 p-4 text-sm leading-[1.75] text-[#52627A] backdrop-blur-sm dark:border-white/[0.08] dark:bg-black/25 dark:text-slate-300">
                      <span className="text-amber-800/95 dark:text-amber-200/90">Your claim here should be scoped to a testable hypothesis…</span>{" "}
                      <span className="text-[#176BFF] dark:text-sky-200/90">…and tied to a cited source from your uploaded references.</span>
                    </p>
                  </div>
                  <div className={`${landingGlassCard} p-6 md:p-7`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#2563EB] dark:text-cyan-400/90">Supervisor</p>
                    <ul className="mt-5 space-y-3 text-xs leading-[1.65] text-[#52627A] dark:text-slate-400 md:text-sm">
                      <li>
                        <span className="font-bold text-[#176BFF] dark:text-sky-200">Call</span> — tighten the claim scope.
                      </li>
                      <li>
                        <span className="font-bold text-amber-800 dark:text-amber-200">Watch</span> — add one primary citation.
                      </li>
                      <li>
                        <span className="font-bold text-[#071A3A] dark:text-teal-200">Next</span> — rewrite the hypothesis in one sentence.
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            </LandingReveal>

            <LandingReveal>
              <LandingPricingSection variant="light" />
            </LandingReveal>

            {/* FAQ */}
            <LandingReveal>
              <section className={`${landingMax} border-t border-[#D9E8FF] py-10 pb-6 dark:border-white/[0.04] md:py-12`}>
                <div className="mx-auto max-w-3xl">
                  <h2 className={`${landingH2} text-center`}>Frequently asked questions</h2>
                  <p className={`${landingLead} mx-auto mt-4 max-w-lg text-center`}>
                    Everything you need to know about ThesisPilot for thesis workflow decisions.
                  </p>
                  <div className="mt-8 space-y-3 md:mt-10">
                    {faqs.map((item) => (
                      <details
                        key={item.q}
                        className={`group ${landingGlassCard} px-5 py-4 open:border-[#176BFF]/25`}
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-semibold text-[#071A3A] marker:content-none [&::-webkit-details-marker]:hidden dark:text-white md:text-base">
                          <span>{item.q}</span>
                          <svg
                            className="h-5 w-5 shrink-0 text-[#176BFF]/80 transition group-open:rotate-180"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden
                          >
                            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </summary>
                        <p className="mt-3 border-t border-[#D9E8FF] pt-3 text-sm leading-[1.65] text-[#52627A] dark:border-white/10 dark:text-slate-400 md:text-base md:leading-[1.7]">{item.a}</p>
                      </details>
                    ))}
                  </div>
                </div>
              </section>
            </LandingReveal>

            {/* Contact */}
            <LandingReveal>
              <section className={`${landingMax} border-t border-[#D9E8FF] py-10 dark:border-white/[0.04] md:py-12`}>
                <div className={`${landingGlassCard} mx-auto max-w-2xl px-6 py-8 text-center md:px-8 md:py-10`}>
                  <h2 className="text-xl font-bold text-[#071A3A] dark:text-white md:text-2xl">Contact</h2>
                  <p className="mx-auto mt-4 max-w-xl text-sm leading-[1.65] text-[#52627A] dark:text-slate-400 md:text-base md:leading-[1.7]">
                    ThesisPilot is in active development. For support or partnerships, use the email you sign up with in account settings, or
                    reach your deployer&apos;s contact channel.
                  </p>
                </div>
              </section>
            </LandingReveal>
          </div>

          <LandingReveal className="relative z-10 mt-auto">
            <SiteMarketingFooter />
          </LandingReveal>

          <SupportChatBubble />
        </main>
      </div>
    </section>
  );
}
