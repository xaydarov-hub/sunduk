'use client';

import { ReactNode } from 'react';

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="stat-card space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-sm text-zinc-400 ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

export function NumberField({ label, hint, value, onChange, min = 0, max, suffix }: { label: string; hint?: string; value: number; onChange: (value: number) => void; min?: number; max?: number; suffix?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input type="number" className="input-dark" min={min} max={max} value={Number.isFinite(value) ? value : 0} onChange={event => onChange(Number(event.target.value))} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">{suffix}</span>}
      </div>
    </Field>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ key: T; label: string }>; value: T; onChange: (key: T) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
      {tabs.map(tab => (
        <button key={tab.key} type="button" role="tab" aria-selected={value === tab.key} onClick={() => onChange(tab.key)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${value === tab.key ? 'bg-gold-500 text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}>{tab.label}</button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'gray'; children: ReactNode }) {
  const map = { green: 'bg-green-500/15 text-green-300', red: 'bg-red-500/15 text-red-300', amber: 'bg-amber-500/15 text-amber-300', gray: 'bg-white/10 text-zinc-300' };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[tone]}`}>{children}</span>;
}

export const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '');
export const fromDateInput = (value: string, endOfDay = false) => (value ? new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString() : undefined);
