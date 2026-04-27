import Link from "next/link";

type ProjectCardProps = {
  id: string;
  title: string;
  field: string;
  degreeLevel: string;
  language: string;
};

export default function ProjectCard({
  id,
  title,
  field,
  degreeLevel,
  language,
}: ProjectCardProps) {
  return (
    <Link
      href={`/dashboard/projects/${id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">
        {field} - {degreeLevel} - {language}
      </p>
    </Link>
  );
}
