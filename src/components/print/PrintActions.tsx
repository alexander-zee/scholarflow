"use client";

export default function PrintActions() {
  return (
    <div className="mb-6 flex gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
      >
        Print / Save as PDF
      </button>
      <button
        type="button"
        onClick={() => window.history.back()}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
      >
        Back
      </button>
    </div>
  );
}
