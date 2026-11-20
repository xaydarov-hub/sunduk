'use client';

import { CheckCircle2, TriangleAlert, XCircle, Info, X } from 'lucide-react';
import { useStore } from '@/lib/store';

const icons = { success: CheckCircle2, error: XCircle, warning: TriangleAlert, info: Info };

export function ToastProvider() {
  const { toasts, removeToast } = useStore();
  return (
    <div className="fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {toasts.map(toast => {
        const Icon = icons[toast.type];
        return (
          <div key={toast.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#202022] p-4 shadow-2xl">
            <Icon className={`h-5 w-5 shrink-0 ${toast.type === 'success' ? 'text-green-400' : toast.type === 'error' ? 'text-red-400' : toast.type === 'warning' ? 'text-amber-400' : 'text-blue-400'}`} />
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{toast.title}</div>{toast.message && <div className="mt-0.5 text-xs text-zinc-400">{toast.message}</div>}</div>
            <button onClick={() => removeToast(toast.id)} className="text-zinc-500 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        );
      })}
    </div>
  );
}
