'use client';

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-xl bg-white/[.03] p-4 text-left">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="mt-0.5 block text-xs text-zinc-500">{hint}</span>}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-gold-500' : 'bg-zinc-700'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${checked ? 'left-[1.375rem]' : 'left-0.5'}`} /></span>
    </button>
  );
}
