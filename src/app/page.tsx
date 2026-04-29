import Link from "next/link";
import LandingPricingSection from "@/components/LandingPricingSection";
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
    q: "Can ThesisPilot generate a full thesis?",
    a: "Yes. ThesisPilot generates a full BSc or MSc thesis draft from your uploaded source material, then lets you revise section by section before export.",
  },
  {
    q: "Can it handle Econometrics and STEM theses?",
    a: "Yes. ThesisPilot supports technical structures across econometrics and STEM workflows, including methodology-heavy chapters and notation-aware drafting.",
  },
  {
    q: "Can it generate figures, tables, equations, and appendices?",
    a: "It is built for structured academic drafts that include figures, tables, equations, and appendices when supported by your sources and prompt context.",
  },
  {
    q: "Can I upload my own references and cite them?",
    a: "Yes. Upload papers, PDFs, notes, and web sources to ground generation in your own material and keep citation context tied to your project.",
  },
  {
    q: "Can I control the target length and structure?",
    a: "Yes. You can steer chapter scope, section depth, and revision direction before export.",
  },
  {
    q: "What exports are available?",
    a: "You can export your thesis to LaTeX, PDF, Markdown, and print-ready outputs without retyping.",
  },
  {
    q: "How is this different from a generic AI chat?",
    a: "Generic chat is built for short conversations. ThesisPilot is built for full thesis workflows: source ingestion, structured generation, citations, review, and export.",
  },
  {
    q: "Does ThesisPilot guarantee AI-detection bypass?",
    a: "No. ThesisPilot is a writing and revision workspace, not a bypass tool. You should review outputs carefully and submit only work you understand and can defend.",
  },
];

export default function Home() {
  return (
    <section className="sf-landing-bleed relative min-h-screen overflow-x-hidden bg-[#f8fbff]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(140%_90%_at_12%_0%,rgba(23,107,255,0.09),transparent_58%),radial-gradient(100%_80%_at_92%_8%,rgba(2,132,199,0.07),transparent_62%),linear-gradient(180deg,#f8fbff_0%,#f4f8ff_42%,#f8fbff_100%)]"
      />
      <div className="relative z-10 min-h-screen">
        <main className="relative z-0 flex min-h-screen w-full flex-col overflow-x-hidden bg-[#f8fbff] text-[#071A3A] dark:text-slate-100">
          <div className="relative z-10 flex-1 space-y-8 md:space-y-10">
            {/* Hero — full-bleed section; content centered inside landingMax */}
            <LandingReveal>
              <section className="relative isolate w-full min-h-[720px] overflow-visible bg-[#f8fbff] py-12 md:py-14 lg:py-16">
                <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#f8fbff]/95 via-[#f8fbff]/70 to-transparent [mask-image:linear-gradient(to_right,black_0%,black_62%,transparent_100%)]" aria-hidden />
                <div className="relative z-10 mx-auto w-full max-w-[1500px] px-8 lg:px-12">
                  <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.22fr_1fr] lg:gap-8 lg:min-h-[min(520px,58vh)]">
                    <div className="min-w-0 max-w-xl">
                      <h1 className="max-w-xl text-pretty text-4xl font-bold leading-[1.08] tracking-[-0.025em] text-[#071A3A] dark:text-white sm:text-5xl sm:leading-[1.06] md:text-6xl md:leading-[1.04] lg:text-[3.5rem] lg:leading-[1.03]">
                        Generate a complete thesis{" "}
                        <span className="text-[#176BFF] dark:text-[#5B9DFF]">— citations, tables, figures, equations.</span>
                      </h1>
                      <p className="mt-7 max-w-xl text-pretty text-lg font-normal leading-relaxed text-[#52627A] dark:text-slate-400/88 md:mt-9 md:text-xl md:leading-relaxed">
                        Upload your papers, references, PDFs, and notes. ThesisPilot turns them into a structured BSc or MSc thesis with real citations, mathematical notation, figures, tables, and appendices — then helps you refine it with an AI supervisor so you{" "}
                        <span className="box-decoration-clone rounded-md bg-[#E8F0FF]/95 px-1.5 py-0.5 font-medium text-[#071A3A] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-[#176BFF]/25 dark:bg-slate-800/95 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:ring-white/12">
                          keep authorship and control exports
                        </span>
                        .
                      </p>
                      <div className="mt-11 flex flex-wrap items-center gap-4 md:mt-14">
                        <Link href="/auth/signup" className={landingPrimaryCta}>
                          <span>Generate thesis — it&apos;s free</span>
                        </Link>
                        <Link href="/auth/signin" className={landingSecondaryCta}>
                          Sign in
                        </Link>
                      </div>
                    </div>

                    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-end overflow-visible bg-transparent lg:min-h-[min(36rem,62vh)]">
                      <img
                        src="/backgrounds/papers.png"
                        alt="Thesis preview"
                        className="ml-auto w-full max-w-[520px] bg-transparent drop-shadow-[0_24px_48px_rgba(0,0,0,0.12)] transition-transform duration-500 sm:w-[560px] sm:max-w-none lg:w-[700px] lg:max-w-none lg:translate-x-6 lg:rotate-[-8deg] lg:scale-[1.15] lg:drop-shadow-[0_60px_120px_rgba(0,0,0,0.18)] lg:hover:scale-[1.18]"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </LandingReveal>

            {/* Trust strip — headline + subheadline only */}
            <LandingReveal>
              <section className="relative w-full overflow-hidden bg-transparent py-8 md:py-10">
                <div className={`${landingMax} relative z-10 text-center`}>
                  <h2 className="mx-auto max-w-[44rem] text-4xl font-bold leading-[1.08] tracking-tight text-[#071A3A] dark:text-white sm:text-5xl sm:leading-[1.06] md:text-6xl md:leading-[1.05] lg:text-[3.5rem] lg:leading-[1.04]">
                    Your thesis, generated from start to finish
                  </h2>
                  <p className="mx-auto mt-4 max-w-2xl text-lg font-normal leading-snug text-[#52627A] dark:text-slate-400 md:mt-5 md:text-xl md:leading-relaxed">
                    ThesisPilot brings your sources, draft generation, academic structure, figures, citations, and supervisor-style review into one workspace — so you can move from source material to export without retyping.
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
              <section className="relative overflow-hidden">
                <div className="relative z-10">
                  <LandingHowItWorks />
                </div>
              </section>
            </LandingReveal>

            {/* vs generic */}
            <LandingReveal>
              <section className="relative overflow-hidden border-t border-[#D9E8FF] py-12 text-[#071A3A] dark:border-white/[0.04] dark:text-white md:py-14">
                <div className={`${landingMax} relative z-10`}>
                  <h2 className={`${landingH2} text-center`}>ThesisPilot vs generic chat</h2>
                  <p className={`${landingLead} mx-auto mt-4 max-w-2xl text-center`}>
                    Generic tools are built for short conversations. ThesisPilot is built for complete academic documents: sources, structure, citations, equations, figures, review, and export.
                  </p>
                  <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-6">
                    <div className={`${landingGlassCard} p-7 md:p-8`}>
                      <p className="text-xs font-bold uppercase tracking-widest text-[#176BFF] dark:text-sky-300/90">ThesisPilot</p>
                      <ul className="mt-5 space-y-3 text-sm leading-[1.6] text-[#52627A] dark:text-slate-200/95">
                        <li>• Full thesis generation from uploaded sources</li>
                        <li>• Source-grounded citations and reference tracking</li>
                        <li>• Figures, tables, equations, and appendices</li>
                        <li>• Structured chapters you can revise and export</li>
                        <li>• AI Supervisor for targeted review</li>
                      </ul>
                    </div>
                    <div className={`${landingGlassCard} border-[#E2E8F0] bg-[#F8FAFC]/90 p-7 hover:border-[#CBD5E1] md:p-8 dark:border-white/[0.08] dark:bg-white/[0.035] dark:hover:border-white/12 dark:supports-[backdrop-filter]:bg-white/[0.025]`}>
                      <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8]">Generic chat</p>
                      <ul className="mt-5 space-y-3 text-sm leading-[1.6] text-[#64748B] dark:text-slate-400">
                        <li>• Easy to lose thread across long drafts</li>
                        <li>• Weak workflow for full thesis structure</li>
                        <li>• Hard to manage citations, figures, and appendices</li>
                        <li>• No clean export pipeline</li>
                        <li>• Often produces disconnected long-form text</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            </LandingReveal>

            {/* Studio strip */}
            <LandingReveal>
              <section className={`${landingMax} border-t border-[#D9E8FF] py-10 dark:border-white/[0.04] md:py-12`}>
                <h2 className={landingH2}>Thesis generator + AI supervisor</h2>
                <p className={landingLead}>
                  Generate the full draft first. Then revise section by section with structured reviews, anchored comments, and focused supervisor-style guidance.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-6 md:mt-8 lg:grid-cols-[1.4fr_1fr] lg:gap-6">
                  <div className={`${landingGlassCard} p-6 md:p-7`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#176BFF] dark:text-sky-400/90">Draft editor</p>
                    <p className="mt-5 rounded-xl border border-[#D9E8FF] bg-[#F5FAFF]/95 p-4 text-sm leading-[1.75] text-[#52627A] backdrop-blur-sm dark:border-white/[0.08] dark:bg-black/25 dark:text-slate-300">
                      <span className="text-amber-800/95 dark:text-amber-200/90">Generated methodology section with model notation, variable definitions, and cited assumptions…</span>{" "}
                      <span className="text-[#176BFF] dark:text-sky-200/90">…ready for targeted revision before export.</span>
                    </p>
                  </div>
                  <div className={`${landingGlassCard} p-6 md:p-7`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#2563EB] dark:text-cyan-400/90">Supervisor</p>
                    <ul className="mt-5 space-y-3 text-xs leading-[1.65] text-[#52627A] dark:text-slate-400 md:text-sm">
                      <li>
                        <span className="font-bold text-[#176BFF] dark:text-sky-200">Call</span> — link the model to the research question.
                      </li>
                      <li>
                        <span className="font-bold text-amber-800 dark:text-amber-200">Watch</span> — add a citation for the identification assumption.
                      </li>
                      <li>
                        <span className="font-bold text-[#071A3A] dark:text-teal-200">Next</span> — rewrite the hypothesis in one measurable sentence.
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            </LandingReveal>

            <LandingReveal>
              <section className="relative overflow-hidden">
                <div className="relative z-10">
                  <LandingPricingSection variant="light" />
                </div>
              </section>
            </LandingReveal>

            {/* FAQ */}
            <LandingReveal>
              <section className="relative overflow-hidden border-t border-[#D9E8FF] py-10 pb-6 dark:border-white/[0.04] md:py-12">
                <div className={`${landingMax} relative z-10`}>
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
