'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Music, ShieldCheck } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const { authReady, currentUser, isAuthenticated, initialized, authError, language, setLanguage, login, bootstrapSystem, checkInitialized } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // birinchi sozlash maydonlari
  const [businessName, setBusinessName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [password2, setPassword2] = useState('');
  const [seedStarter, setSeedStarter] = useState(true);

  useEffect(() => { void checkInitialized(); }, [checkInitialized]);

  useEffect(() => {
    if (isAuthenticated && currentUser) {
      router.replace(currentUser.role === 'admin' ? '/admin/' : currentUser.role === 'bar' ? '/bar/' : '/waiter/');
    }
  }, [isAuthenticated, currentUser, router]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(username, password);
    if (!result.ok) setError(result.error);
    setLoading(false);
  };

  const submitSetup = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== password2) { setError(t('Parollar bir xil emas', 'Пароли не совпадают')); return; }
    setLoading(true);
    const result = await bootstrapSystem({ name: adminName, username, password, businessName, seedStarter });
    if (!result.ok) setError(result.error);
    setLoading(false);
  };

  const setupMode = initialized === false;
  const checking = !authReady || initialized === null;
  const accountError = authError === 'INACTIVE'
    ? t('Hisobingiz o‘chirilgan. Administrator bilan bog‘laning.', 'Ваша учётная запись отключена. Обратитесь к администратору.')
    : authError === 'NO_PROFILE'
      ? t('Hisob topilmadi. Administrator bilan bog‘laning.', 'Учётная запись не найдена. Обратитесь к администратору.')
      : '';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-graphite-900 p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-gold-500/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gold-500/5 blur-3xl" />
      </div>

      <div className="absolute right-6 top-6 flex items-center gap-2 rounded-lg border border-graphite-600/40 bg-graphite-800 p-1">
        {(['uz', 'ru'] as const).map(lang => (
          <button key={lang} onClick={() => setLanguage(lang)} className={`rounded px-3 py-1 text-sm font-medium transition-all ${language === lang ? 'bg-gold-500 text-graphite-900' : 'text-graphite-200 hover:text-white'}`}>{lang.toUpperCase()}</button>
        ))}
      </div>

      <div className="mb-8 text-center">
        <div className="mb-2 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500 shadow-lg shadow-gold-500/30"><Music className="h-6 w-6 text-graphite-900" /></div>
          <h1 className="text-4xl font-black tracking-tight"><span className="text-white">SUN</span><span className="text-gold-400">Duk</span></h1>
        </div>
        <p className="text-sm text-graphite-300">{t('Bar & VIP Karaoke boshqaruv tizimi', 'Система управления баром и VIP-караоке')}</p>
      </div>

      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-graphite-600/40 bg-graphite-800 p-8 shadow-2xl">
          {checking ? (
            <div className="flex flex-col items-center gap-3 py-10 text-graphite-300">
              <Loader2 className="h-7 w-7 animate-spin text-gold-400" />
              <span className="text-sm">{t('Yuklanmoqda…', 'Загрузка…')}</span>
              {authReady && initialized === null && (
                <button onClick={() => void checkInitialized()} className="btn-secondary mt-2 text-sm">{t('Qayta urinish', 'Повторить')}</button>
              )}
            </div>
          ) : setupMode ? (
            <form onSubmit={submitSetup} className="space-y-4">
              <div className="flex items-center gap-2 text-gold-400"><ShieldCheck className="h-5 w-5" /><h2 className="text-xl font-bold text-white">{t('Birinchi sozlash', 'Первая настройка')}</h2></div>
              <p className="text-sm text-graphite-300">{t('Bosh administrator hisobini yarating. Bu hisob barcha huquqlarga ega bo‘ladi — parolni xavfsiz saqlang.', 'Создайте главную учётную запись администратора. У неё будут все права — храните пароль в безопасности.')}</p>
              <label className="block text-sm text-graphite-200">{t('Korxona nomi', 'Название заведения')}<input className="input-dark mt-1" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="SUNDuk" /></label>
              <label className="block text-sm text-graphite-200">{t('Sizning ismingiz', 'Ваше имя')}<input className="input-dark mt-1" value={adminName} onChange={e => setAdminName(e.target.value)} required /></label>
              <label className="block text-sm text-graphite-200">{t('Login (lotin harflari)', 'Логин (латиница)')}<input className="input-dark mt-1" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" required /></label>
              <label className="block text-sm text-graphite-200">{t('Parol (kamida 6 belgi)', 'Пароль (минимум 6 символов)')}<input type="password" className="input-dark mt-1" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required /></label>
              <label className="block text-sm text-graphite-200">{t('Parolni takrorlang', 'Повторите пароль')}<input type="password" className="input-dark mt-1" value={password2} onChange={e => setPassword2(e.target.value)} autoComplete="new-password" required /></label>
              <label className="flex items-start gap-3 rounded-xl bg-white/[.03] p-3 text-sm text-graphite-200">
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-amber-500" checked={seedStarter} onChange={e => setSeedStarter(e.target.checked)} />
                <span>{t('7 ta namuna xona va namuna menyuni qo‘shish (keyin Admin panelida o‘zgartirasiz)', 'Добавить 7 образцовых комнат и меню (потом измените в админке)')}</span>
              </label>
              {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
              <button type="submit" disabled={loading} className="btn-gold flex min-h-12 w-full items-center justify-center gap-2">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{t('Tizimni sozlash', 'Настроить систему')}</button>
            </form>
          ) : (
            <form onSubmit={submitLogin} className="space-y-4">
              <h2 className="text-xl font-bold text-white">{t('Tizimga kirish', 'Вход в систему')}</h2>
              <label className="block text-sm font-medium text-graphite-200">{t('Login', 'Логин')}
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="input-dark mt-1.5" required autoComplete="username" autoCapitalize="none" autoCorrect="off" />
              </label>
              <label className="block text-sm font-medium text-graphite-200">{t('Parol', 'Пароль')}
                <div className="relative mt-1.5">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input-dark pr-10" required autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-graphite-300 transition-colors hover:text-white" aria-label="Toggle password">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              {(error || accountError) && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error || accountError}</div>}
              <button type="submit" disabled={loading} className="btn-gold flex min-h-12 w-full items-center justify-center gap-2">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{t('Kirish', 'Войти')}</button>
              <p className="pt-1 text-center text-xs text-graphite-400">{t('Login va parolni administrator beradi', 'Логин и пароль выдаёт администратор')}</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
