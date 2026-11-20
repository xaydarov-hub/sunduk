'use client';

import { ReactNode } from 'react';
import { Plus } from 'lucide-react';

interface ModulePageProps {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  /** Sarlavha yonidagi qo'shimcha tugmalar. */
  extra?: ReactNode;
  children?: ReactNode;
}

export function ModulePage({ title, subtitle, action, onAction, extra, children }: ModulePageProps) {
  return (
    <div className="page-container">
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          {action && (
            <button type="button" onClick={onAction} disabled={!onAction} className="btn-gold flex items-center gap-2">
              <Plus className="h-4 w-4" />{action}
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
