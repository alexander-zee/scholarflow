type TextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export default function TextEditor({ value, onChange, placeholder }: TextEditorProps) {
  return (
    <textarea
      className="min-h-72 w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 focus:border-blue-500 focus:outline-none"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={
        placeholder || "Paste your thesis section here for structured academic feedback."
      }
    />
  );
}
