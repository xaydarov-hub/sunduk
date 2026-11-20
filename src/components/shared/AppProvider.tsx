'use client';

import { ReactNode, useEffect } from 'react';
import { TriangleAlert, WifiOff } from 'lucide-react';
import { initApp, useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';

/** Ilovani ishga tushiradi (Firebase, auth, soat), internet yo'qligini ko'rsatadi. */
export function AppProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const configError = useStore(state => state.configError);
  const online = useStore(state => state.online);

  useEffect(() => { initApp(); }, []);

  if (configError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-lg rounded-2xl border border-red-500/30 bg-graphite-800 p-8">
          <TriangleAlert className="mb-4 h-8 w-8 text-red-400" />
          <h1 className="text-xl font-bold">Firebase sozlanmagan</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Loyiha papkasidagi <code className="rounded bg-black/40 px-1.5 py-0.5">.env.local</code> faylida <code className="rounded bg-black/40 px-1.5 py-0.5">NEXT_PUBLIC_FIREBASE_*</code> qiymatlari kiritilishi kerak. Tafsilotlar README.md → “Ishga tushirish”.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!online && (
        <div className="no-print fixed inset-x-0 top-0 z-[120] flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
          <WifiOff className="h-4 w-4 shrink-0" />
          {t('Internet yo‘q — to‘lov va buyurtma amallari bajarilmaydi. Aloqa tiklanishini kuting.', 'Нет интернета — оплата и заказы недоступны. Дождитесь восстановления связи.')}
        </div>
      )}
      {children}
    </>
  );
}
