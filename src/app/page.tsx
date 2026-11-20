'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, currentUser, authReady } = useStore();

  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated || !currentUser) router.replace('/login/');
    else router.replace(currentUser.role === 'admin' ? '/admin/' : currentUser.role === 'bar' ? '/bar/' : '/waiter/');
  }, [authReady, isAuthenticated, currentUser, router]);

  return (
    <div className="min-h-screen bg-graphite-900 flex items-center justify-center">
      <div className="text-gold-400 text-xl font-semibold animate-pulse">
        SUNDuk yuklanmoqda...
      </div>
    </div>
  );
}
