import Link from "next/link";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/projects", label: "Projects" },
  { href: "/dashboard/projects/new", label: "New Project" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardSidebar() {
  return (
    <aside className="w-full max-w-60 rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        ScholarFlow
      </p>
      <nav className="space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
