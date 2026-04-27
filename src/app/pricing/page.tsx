import PricingCard from "@/components/PricingCard";

export default function PricingPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-8">
        <h1 className="text-3xl font-bold text-slate-900">Pricing</h1>
        <p className="mt-2 text-slate-600">
          Choose the plan that matches your academic workflow.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <PricingCard
          title="Free"
          price="$0"
          features={["3 AI reviews/month", "max 1 project", "basic feedback"]}
          cta="Start free"
        />
        <PricingCard
          title="Pro"
          price="$19/mo"
          features={[
            "Higher AI review limits",
            "multiple projects",
            "methodology checker",
            "supervisor-style comments",
            "export feedback report",
          ]}
          cta="Upgrade to Pro"
          highlighted
        />
      </section>
    </main>
  );
}
