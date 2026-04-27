type PricingCardProps = {
  title: string;
  price: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
};

export default function PricingCard({
  title,
  price,
  features,
  cta,
  highlighted,
}: PricingCardProps) {
  return (
    <article
      className={`rounded-xl border p-6 shadow-sm ${
        highlighted ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"
      }`}
    >
      <h3 className="text-xl font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-3xl font-extrabold text-slate-900">{price}</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {features.map((feature) => (
          <li key={feature}>- {feature}</li>
        ))}
      </ul>
      <button className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white">
        {cta}
      </button>
    </article>
  );
}
