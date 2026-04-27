import Link from "next/link";
import LandingAmbientMist from "@/components/LandingAmbientMist";
import LandingPricingSection from "@/components/LandingPricingSection";
import LandingReveal from "@/components/LandingReveal";
import SupportChatBubble from "@/components/SupportChatBubble";

const pillars = [
  {
    title: "Reference-first workflow",
    body: "Upload PDFs and documents. ScholarFlow uses extracted text to shape outlines and draft scaffolding that stay aligned with your sources—not generic essays detached from your materials.",
    tag: "Sources in the loop",
  },
  {
    title: "Supervisor-style studio",
    body: "Write in a full-width editor with structured review modes, anchored comments that jump to exact sentences, and a cost-capped supervisor chat for the next best edit—not endless chat walls.",
    tag: "Guidance, not ghostwriting",
  },
  {
    title: "Integrity by design",
    body: "Every flow is framed as feedback, revision, and learning. ScholarFlow is built for students who want stronger argumentation, clearer methods, and defensible citations.",
    tag: "Academic integrity first",
  },
];

const pipelineSteps = [
  {
    n: 1,
    title: "Upload your papers",
    body: "Add PDFs, DOCX, or text. ScholarFlow extracts readable text so outlines and drafts stay grounded in your sources—not a disconnected chat essay.",
    icon: "📚",
  },
  {
    n: 2,
    title: "Scaffold outline & draft",
    body: "Generate a structured outline and first-draft chapters you edit and own. This is scaffolding for revision, not a submission-ready ghostwritten thesis.",
    icon: "🧭",
  },
  {
    n: 3,
    title: "Supervise in the studio",
    body: "Open the writing studio: structured reviews, anchored comments that jump to exact sentences, and short supervisor-style chat focused on your next best edit.",
    icon: "💬",
  },
  {
    n: 4,
    title: "Export & finish strong",
    body: "Download PDF, plain text, Markdown, or LaTeX—or print from the browser. You remain accountable for citations, claims, and institutional integrity rules.",
    icon: "🎓",
  },
];

const faqs: { q: string; a: string }[] = [
  {
    q: "Can I control the target length of my draft?",
    a: "Yes. You can steer scope by refining outline sections and iterating in the writing studio. ScholarFlow is designed for staged drafting and revision, so you can expand or compress sections before final export.",
  },
  {
    q: "Can I upload my own references and cite them?",
    a: "Yes. Upload PDFs or text-based documents to your project first; ScholarFlow uses those sources to shape outlines and draft scaffolding. Stronger citations depend on clean, extractable source text.",
  },
  {
    q: "What exports are available?",
    a: "You can export to PDF, print, plain text, Markdown, and LaTeX. If you need Word, the current path is exporting plain text/Markdown/LaTeX and converting in your preferred editor.",
  },
  {
    q: "How is this different from a generic AI chat?",
    a: "ScholarFlow is project-based: references, outline, generated draft sections, structured review, anchored comments, and supervisor chat in one workflow. It is built for long-form thesis iteration, not one-off prompts.",
  },
  {
    q: "Does ScholarFlow guarantee AI-detection bypass?",
    a: "No. ScholarFlow is a revision and learning workspace, not a bypass tool. You should treat outputs as editable scaffolding and submit only work you understand and can defend.",
  },
  {
    q: "Which languages are supported?",
    a: "You can set a project language and prompts/outputs follow that setting. Quality varies by language; English is typically strongest with current models.",
  },
  {
    q: "What if my PDF does not extract correctly?",
    a: "Some PDFs are scans and contain little machine-readable text. In that case, use OCR or upload text-native PDFs/DOCX so ScholarFlow can properly index and use the source.",
  },
  {
    q: "How do review limits work?",
    a: "Outline generation, full-draft generation, structured reviews, and supervisor chat consume monthly AI allowance. Limits depend on your plan and reset each billing cycle.",
  },
];

export default function Home() {
  return (
    <main className="relative flex min-h-[calc(100dvh-5.5rem)] flex-col">
      <LandingAmbientMist />
      <div className="relative z-10 flex-1 space-y-16 md:space-y-24">
      {/* Hero — softer shell, mist shows through from fixed layers */}
      <LandingReveal>
      <section className="sf-landing-hero-pattern relative overflow-hidden py-8 shadow-lg shadow-cyan-900/5 dark:shadow-black/20 md:rounded-[2rem] md:py-10 md:ring-1 md:ring-cyan-200/35 dark:md:ring-slate-600/40">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-cyan-400/10 to-transparent dark:from-cyan-400/5" />
        <div className="relative grid gap-10 p-8 md:grid-cols-[1.05fr_1fr] md:p-12 lg:p-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-800 dark:text-teal-300">Thesis workspace</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight text-[#0f2847] dark:text-slate-100 md:text-6xl">
              Stronger theses.
              <span className="block text-teal-700 dark:text-teal-400">Still 100% your authorship.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#0c1e3c]/85 dark:text-slate-300 md:text-lg">
              ScholarFlow combines a <strong>reference-driven outline</strong>, <strong>editable draft scaffolding</strong>, and a{" "}
              <strong>writing studio with an AI supervisor</strong>—so you iterate like you would with a supervisor meeting, not a
              toy chat window.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/auth/signup"
                className="rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-7 py-3 text-sm font-semibold text-white shadow-md shadow-teal-900/20 transition hover:brightness-105"
              >
                Start free — create a project
              </Link>
              <Link
                href="/auth/signin"
                className="rounded-full border-2 border-[#0f2847]/15 bg-white/90 px-7 py-3 text-sm font-semibold text-[#0f2847] shadow-sm backdrop-blur transition hover:border-teal-500/40 dark:border-slate-500/40 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:border-teal-500/50"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-6 text-xs font-medium text-[#0c1e3c]/55 dark:text-slate-500">
              Pick ScholarFlow when you want thesis-semester structure: sources → outline → draft → supervised revision → export.
            </p>
          </div>

          <div className="flex flex-col justify-center gap-4">
            <div className="rounded-xl bg-white/85 p-5 shadow-md ring-1 ring-slate-200/50 backdrop-blur-sm dark:bg-slate-900/85 dark:ring-slate-600/45">
              <p className="text-[10px] font-bold uppercase tracking-widest text-teal-800 dark:text-teal-300">Why students switch</p>
              <ul className="mt-3 space-y-2.5 text-sm leading-snug text-[#0c1e3c]/90 dark:text-slate-300">
                <li className="flex gap-2">
                  <span className="text-teal-600 dark:text-teal-400">✓</span>
                  Anchored comments jump to the exact sentence—less hunting, faster revision.
                </li>
                <li className="flex gap-2">
                  <span className="text-teal-600 dark:text-teal-400">✓</span>
                  One workspace for references, generated sections, and long-form editing.
                </li>
                <li className="flex gap-2">
                  <span className="text-teal-600 dark:text-teal-400">✓</span>
                  Exports for print/PDF, text, Markdown, and LaTeX for a more “real paper” pipeline.
                </li>
              </ul>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-white to-cyan-50/70 p-5 shadow-inner ring-1 ring-cyan-200/30 dark:from-slate-800 dark:to-slate-900 dark:ring-slate-600/40">
              <p className="text-xs font-semibold text-[#0f2847] dark:text-slate-100">This week’s best use</p>
              <p className="mt-2 text-sm text-[#0c1e3c]/85 dark:text-slate-300">
                Upload 2–5 key papers → generate outline → run a first draft → move to the writing studio → tighten claims and citations
                with anchored supervisor feedback.
              </p>
            </div>
          </div>
        </div>
      </section>
      </LandingReveal>

      {/* Honest “trust” strip — open layout, light divider instead of a box */}
      <LandingReveal>
      <section className="mx-auto max-w-3xl border-0 border-t border-teal-200/45 px-4 py-10 text-center dark:border-slate-600/50 md:px-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-800 dark:text-teal-300">Credibility — keep it real</p>
        <p className="mx-auto mt-2 max-w-3xl text-sm leading-relaxed text-[#0c1e3c]/85 dark:text-slate-300">
          Listing prestigious universities without permission implies endorsement you probably do not have. ScholarFlow is better
          positioned as a <strong>workflow product</strong> for thesis writers everywhere—until you have real partners, say what you
          actually do.
        </p>
        <p className="mt-3 text-base font-semibold text-[#0f2847] dark:text-slate-100">
          Built for thesis writers who want{" "}
          <span className="text-teal-700 dark:text-teal-400">references, structure, supervision, and exports</span>—without ghostwriting.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#0f2847]/65 dark:text-slate-400">
          {["Literature-heavy", "Methods chapters", "Theory + empirics", "Citation discipline"].map((label) => (
            <span key={label} className="rounded-full bg-teal-50/90 px-3 py-1 text-teal-900/90 dark:bg-slate-800/90 dark:text-slate-200">
              {label}
            </span>
          ))}
        </div>
      </section>
      </LandingReveal>

      {/* Pillars — column rhythm, accent rule instead of three boxes */}
      <LandingReveal>
      <section className="grid gap-12 md:grid-cols-3 md:gap-10">
        {pillars.map((p, i) => (
          <article
            key={p.title}
            className={`border-0 border-teal-200/45 py-2 pl-0 dark:border-slate-600/50 ${i > 0 ? "md:border-l md:pl-8" : ""}`}
          >
            <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              {p.tag}
            </span>
            <h2 className="mt-4 text-lg font-bold text-[#0f2847] dark:text-slate-100">{p.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#0c1e3c]/85 dark:text-slate-300">{p.body}</p>
          </article>
        ))}
      </section>
      </LandingReveal>

      {/* How it works — true full-bleed (escapes layout padding via .sf-landing-bleed) */}
      <LandingReveal className="sf-landing-bleed">
      <section className="sf-pipeline-dark py-16 text-white md:py-20">
        <div className="relative z-10 mx-auto max-w-[2200px] px-5 sm:px-8 md:px-12 lg:px-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-300/90">How it works</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">It&apos;s simple</h2>
            <p className="mt-3 text-sm text-white/70 md:text-base">
              Four steps from sources to supervised revision—structured like a product tour, honest about what the AI does (and does
              not) do.
            </p>
          </div>

          <div className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
            {/* connector line (desktop) */}
            <div
              className="pointer-events-none absolute left-[8%] right-[8%] top-7 hidden h-px bg-gradient-to-r from-transparent via-teal-400/35 to-transparent md:block"
              aria-hidden
            />
            {pipelineSteps.map((s) => (
              <div key={s.n} className="relative text-center md:pt-2 md:text-left">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-xl shadow-lg shadow-teal-900/30 md:mx-0">
                  <span aria-hidden>{s.icon}</span>
                </div>
                <p className="mt-3 text-xs font-bold text-teal-200/90">Step {s.n}</p>
                <h3 className="mt-1 text-lg font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 grid border-t border-white/10 pt-10 text-center sm:grid-cols-3 sm:divide-x sm:divide-white/10">
            <div className="px-4 py-3 sm:py-0">
              <p className="text-3xl font-extrabold text-white">7</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/55">Structured review modes</p>
            </div>
            <div className="px-4 py-3 sm:py-0">
              <p className="text-3xl font-extrabold text-white">5</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/55">Export paths (incl. print)</p>
            </div>
            <div className="px-4 py-3 sm:py-0">
              <p className="text-3xl font-extrabold text-teal-300">∞</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/55">Your edits & authorship</p>
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-2xl rounded-xl bg-white/5 px-5 py-4 text-center text-xs text-white/65 ring-1 ring-white/10">
            Replace this stats row with <strong className="text-white/85">real metrics</strong> once you have production analytics
            (signups, reviews run, satisfaction). Until then, the numbers above reflect actual product capabilities—not inflated user
            counts.
          </div>
        </div>
      </section>
      </LandingReveal>

      {/* vs generic — full-bleed navy band with visible mesh */}
      <LandingReveal className="sf-landing-bleed">
      <section className="sf-navy-band py-12 text-white shadow-xl md:py-16">
        <div className="relative z-10 mx-auto max-w-[2200px] px-5 sm:px-8 md:px-12 lg:px-16">
          <h2 className="text-center text-3xl font-extrabold tracking-tight md:text-4xl">ScholarFlow vs generic chat</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-cyan-100/95 md:text-base">
            Generic tools optimize for short messages. ScholarFlow optimizes for long-form academic iteration: structure, evidence,
            and repeatable review.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-xl bg-white/[0.08] p-6 backdrop-blur-sm ring-1 ring-white/15">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-200">ScholarFlow</p>
              <ul className="mt-3 space-y-2 text-sm text-cyan-50/95">
                <li>• Project memory + reference uploads</li>
                <li>• Outline + draft sections you can export</li>
                <li>• Structured review + anchored jump-to-text</li>
                <li>• Cost-capped supervisor chat</li>
              </ul>
            </div>
            <div className="rounded-xl bg-black/25 p-6 ring-1 ring-white/10">
              <p className="text-xs font-bold uppercase tracking-widest text-white/60">Generic chat</p>
              <ul className="mt-3 space-y-2 text-sm text-white/75">
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

      {/* Studio preview — airy section, light rings instead of heavy boxes */}
      <LandingReveal>
      <section className="bg-gradient-to-b from-white via-slate-50/30 to-transparent py-12 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 md:py-16">
        <h2 className="text-3xl font-extrabold tracking-tight text-[#0f2847] dark:text-slate-100 md:text-4xl">Writing studio + AI supervisor</h2>
        <p className="mt-2 max-w-3xl text-sm text-[#0c1e3c]/85 dark:text-slate-300 md:text-base">
          Draft on the left. On the right: structured reviews, anchored comments, and short supervisor chat tuned for the{" "}
          <strong>next best action</strong>—like a supervisor corridor conversation, not a term paper from the model.
        </p>
        <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl bg-white/95 p-5 shadow-md ring-1 ring-slate-200/60 dark:bg-slate-900/95 dark:ring-slate-600/50">
            <p className="text-xs font-bold uppercase tracking-widest text-teal-800 dark:text-teal-300">Draft editor</p>
            <p className="mt-3 rounded-lg border border-dashed border-teal-200/55 bg-teal-50/40 p-4 text-sm leading-7 text-[#0c1e3c]/90 dark:border-slate-600/60 dark:bg-slate-800/50 dark:text-slate-300">
              <span className="bg-amber-200/80 px-0.5 dark:bg-amber-900/50 dark:text-amber-100">Your claim here should be scoped to a testable hypothesis…</span>{" "}
              <span className="bg-cyan-200/70 px-0.5 dark:bg-cyan-900/40 dark:text-cyan-100">…and tied to a cited source from your uploaded references.</span>
            </p>
          </div>
          <div className="rounded-xl bg-white/95 p-5 shadow-md ring-1 ring-cyan-200/40 dark:bg-slate-900/95 dark:ring-slate-600/50">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-800 dark:text-cyan-300">Supervisor</p>
            <div className="mt-3 space-y-2 text-xs text-[#0c1e3c]/80 dark:text-slate-400">
              <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50/90 px-3 py-2 dark:border-blue-400 dark:bg-blue-950/50">
                <span className="font-bold text-blue-900 dark:text-blue-200">Call</span> — tighten the claim scope.
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 dark:border-amber-700/50 dark:bg-amber-950/40">
                <span className="font-bold text-amber-900 dark:text-amber-200">Watch</span> — add one primary citation.
              </div>
              <div className="rounded-lg border-l-4 border-emerald-600 bg-emerald-50/90 px-3 py-2 dark:border-emerald-500 dark:bg-emerald-950/40">
                <span className="font-bold text-emerald-900 dark:text-emerald-200">Next</span> — rewrite the hypothesis in one sentence.
              </div>
            </div>
          </div>
        </div>
      </section>
      </LandingReveal>

      {/* Pricing — monthly / annual toggle; motion from LandingReveal */}
      <LandingReveal>
        <LandingPricingSection />
      </LandingReveal>

      {/* FAQ */}
      <LandingReveal>
      <section className="relative py-14 md:py-20">
        <div className="relative z-10 mx-auto w-full max-w-[1500px]">
        <h2 className="text-4xl font-extrabold tracking-tight text-[#0f2847] dark:text-slate-100 md:text-5xl">FAQ&apos;s</h2>
        <p className="mt-2 text-base text-[#0c1e3c]/75 dark:text-slate-400">Clear product answers for thesis workflow decisions.</p>
        <div className="mt-8 divide-y divide-teal-900/10 dark:divide-slate-700/80">
          {faqs.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-[#0f2847] dark:text-slate-100 marker:content-none [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-lg text-teal-800 transition group-open:rotate-45 dark:bg-slate-700 dark:text-teal-200">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[110ch] text-base leading-relaxed text-[#0c1e3c]/85 dark:text-slate-300">{item.a}</p>
            </details>
          ))}
        </div>
        </div>
      </section>
      </LandingReveal>

      {/* Contact — honest */}
      <LandingReveal>
      <section className="border-0 border-t border-cyan-200/40 bg-gradient-to-r from-cyan-50/50 via-white to-transparent py-12 dark:border-slate-600/40 dark:from-slate-900/80 dark:via-slate-900 dark:to-slate-950 md:py-16">
        <h2 className="text-2xl font-bold text-[#0f2847] dark:text-slate-100">Contact</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#0c1e3c]/85 dark:text-slate-300">
          ScholarFlow is in active development. For support or partnerships, use the email you sign up with in account settings, or
          reach your deployer&apos;s contact channel. A dedicated support inbox can be wired in when you go to production.
        </p>
      </section>
      </LandingReveal>
      </div>

      {/* Full-bleed footer — edge-to-edge + layered pattern */}
      <LandingReveal className="sf-landing-bleed relative z-10 mt-auto">
      <footer className="sf-footer-bleed py-16 text-cyan-50/90 shadow-[0_-16px_48px_rgba(7,26,51,0.35)] md:py-20 lg:py-24">
        <div className="relative z-10 mx-auto w-full max-w-[2200px] px-5 sm:px-8 md:px-12 lg:px-16">
          <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4 border-b border-white/10 pb-8 text-sm font-medium uppercase tracking-[0.12em] text-cyan-100/90 sm:justify-evenly sm:gap-x-6 md:justify-between md:tracking-wide">
            <Link href="/pricing" className="transition hover:text-white">
              Pricing
            </Link>
            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="transition hover:text-white">
              Privacy
            </Link>
            <Link href="/academic-integrity" className="transition hover:text-white">
              Academic integrity
            </Link>
          </div>
          <div className="mt-12 flex flex-col gap-8 md:mt-14 md:flex-row md:items-end md:justify-between lg:mt-16">
            <div className="max-w-3xl">
              <p className="text-2xl font-bold tracking-tight text-white md:text-3xl">ScholarFlow</p>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-cyan-100/80 md:text-base md:leading-relaxed">
                Thesis-direction workspace: references, outlines, editable draft scaffolding, structured review, anchored supervisor
                comments, and integrity-first guidance. You keep authorship and accountability for every submission.
              </p>
            </div>
            <p className="shrink-0 text-xs text-cyan-200/60 md:text-right md:text-sm">© {new Date().getFullYear()} ScholarFlow</p>
          </div>
        </div>
      </footer>
      </LandingReveal>

      <SupportChatBubble />
    </main>
  );
}
