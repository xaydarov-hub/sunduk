'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3, Bell, CalendarDays, ChevronLeft, ChevronRight, DoorOpen, History,
  LayoutDashboard, LogOut, Menu, Package, ReceiptText, Settings, ShoppingCart,
  Tags, Users, UserCog, WalletCards, UtensilsCrossed, X, Receipt, Boxes, Banknote, KeyRound, Loader2, Printer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useMounted, useWakeLock } from '@/lib/hooks';
import { beep } from '@/lib/sound';
import { OrderWatcher } from '@/components/shared/OrderWatcher';
import { DeviceSettings } from '@/components/shared/DeviceSettings';
import { roleLabel } from '@/lib/labels';
import { getTimeAgo } from '@/lib/utils';
import { UserRole } from '@/types';
import { Modal } from '@/components/ui/Modal';

interface NavItem { href: string; uz: string; ru: string; icon: LucideIcon; also?: string[] }

const adminNav: NavItem[] = [
  { href: '/admin', uz: 'Boshqaruv', ru: 'Панель', icon: LayoutDashboard },
  { href: '/admin/rooms', uz: 'Xonalar', ru: 'Комнаты', icon: DoorOpen },
  { href: '/admin/orders', uz: 'Buyurtmalar', ru: 'Заказы', icon: ShoppingCart },
  { href: '/admin/cashier', uz: 'Kassa', ru: 'Касса', icon: WalletCards },
  { href: '/admin/bookings', uz: 'Bronlar', ru: 'Брони', icon: CalendarDays },
  { href: '/admin/products', uz: 'Mahsulotlar', ru: 'Товары', icon: Package },
  { href: '/admin/categories', uz: 'Kategoriyalar', ru: 'Категории', icon: Tags },
  { href: '/admin/inventory', uz: 'Ombor', ru: 'Склад', icon: Boxes },
  { href: '/admin/customers', uz: 'Mijozlar', ru: 'Клиенты', icon: Users },
  { href: '/admin/reports', uz: 'Hisobotlar', ru: 'Отчёты', icon: BarChart3 },
  { href: '/admin/expenses', uz: 'Xarajatlar', ru: 'Расходы', icon: Banknote },
  { href: '/admin/staff', uz: 'Xodimlar', ru: 'Сотрудники', icon: UserCog },
  { href: '/admin/history', uz: 'Faoliyat', ru: 'Активность', icon: History },
  { href: '/admin/settings', uz: 'Sozlamalar', ru: 'Настройки', icon: Settings },
];

const barNav: NavItem[] = [
  { href: '/bar', uz: 'Yangi savdo', ru: 'Новая продажа', icon: ShoppingCart },
  { href: '/bar/orders', uz: 'Buyurtmalar', ru: 'Заказы', icon: UtensilsCrossed },
  { href: '/bar/payments', uz: 'To‘lovlar', ru: 'Платежи', icon: WalletCards },
  { href: '/bar/receipts', uz: 'Cheklar', ru: 'Чеки', icon: Receipt },
  { href: '/bar/report', uz: 'Hisobot', ru: 'Отчёт', icon: BarChart3 },
  { href: '/bar/history', uz: 'Tarix', ru: 'История', icon: History },
];

const waiterNav: NavItem[] = [
  { href: '/waiter', uz: 'Xonalar', ru: 'Комнаты', icon: DoorOpen, also: ['/waiter/room'] },
  { href: '/waiter/orders', uz: 'Buyurtmalar', ru: 'Заказы', icon: ReceiptText },
  { href: '/waiter/history', uz: 'Tarix', ru: 'История', icon: History },
];

const roots = ['/admin', '/bar', '/waiter'];

export function DashboardShell({ children, role }: { children: ReactNode; role: UserRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const { currentUser, isAuthenticated, authReady, syncReady, language, setLanguage, logout, notifications, markNotificationRead, markAllNotificationsRead, changePassword, addToast } = useStore();
  const [pwOpen, setPwOpen] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  useWakeLock(role === 'bar');
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const t = (uz: string, ru: string) => (language === 'uz' ? uz : ru);
  const seenNotification = useRef<string | null>(null);
  const notificationBaseline = useRef(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const allowed = isAuthenticated && !!currentUser && currentUser.role === role;
  const mine = notifications.filter(n => n.targetRole === role || n.targetRole === 'all');
  const unread = mine.filter(n => !n.isRead).length;

  useEffect(() => {
    if (!mounted || !authReady) return;
    if (!isAuthenticated || !currentUser) router.replace('/login/');
    else if (currentUser.role !== role) router.replace(currentUser.role === 'admin' ? '/admin/' : currentUser.role === 'bar' ? '/bar/' : '/waiter/');
  }, [mounted, authReady, isAuthenticated, currentUser, role, router]);

  // Yangi bildirishnoma kelganda tovush va xabar (boshqa tab/oynadan kelganlar ham)
  useEffect(() => {
    const newest = mine[0];
    // Birinchi yuklanishda mavjud bildirishnomalar uchun tovush chalinmaydi
    if (!notificationBaseline.current) { notificationBaseline.current = true; seenNotification.current = newest?.id ?? null; return; }
    if (!newest) return;
    if (newest.id !== seenNotification.current) {
      seenNotification.current = newest.id;
      if (!newest.isRead) {
        beep();
        addToast({ type: newest.type === 'error' ? 'error' : newest.type, title: language === 'uz' ? newest.title : newest.titleRu, message: language === 'uz' ? newest.message : newest.messageRu });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  useEffect(() => {
    if (!bellOpen) return;
    const onClick = (event: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(event.target as Node)) setBellOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [bellOpen]);

  useEffect(() => { setOpen(false); setBellOpen(false); }, [pathname]);

  if (!mounted || !authReady || !allowed || !currentUser) return <div className="flex min-h-screen items-center justify-center bg-[#101011]"><Loader2 className="h-8 w-8 animate-spin text-gold-400" /></div>;
  if (!syncReady) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#101011] text-zinc-400"><Loader2 className="h-8 w-8 animate-spin text-gold-400" /><span className="text-sm">{t('Ma’lumotlar yuklanmoqda…', 'Загрузка данных…')}</span></div>;

  const submitPassword = async () => {
    setPwBusy(true);
    const result = await changePassword(oldPw, newPw);
    setPwBusy(false);
    if (!result.ok) { addToast({ type: 'error', title: result.error, message: '' }); return; }
    addToast({ type: 'success', title: t('Parol o‘zgartirildi', 'Пароль изменён'), message: '' });
    setPwOpen(false); setOldPw(''); setNewPw('');
  };

  const nav = role === 'admin' ? adminNav : role === 'bar' ? barNav : waiterNav;
  const isActive = (item: NavItem) =>
    pathname === item.href ||
    (item.also || []).some(prefix => pathname.startsWith(prefix)) ||
    (!roots.includes(item.href) && pathname.startsWith(item.href));
  const label = (item: NavItem) => (language === 'uz' ? item.uz : item.ru);
  const bottomNav = role !== 'admin';

  const navContent = (
    <>
      <div className={`flex h-20 items-center border-b border-white/5 px-5 ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-500 font-black text-black">S</div>
        {!collapsed && <div className="ml-3"><div className="font-bold tracking-wide">SUN<span className="text-gold-400">Duk</span></div><div className="text-[10px] uppercase text-zinc-500">{roleLabel(role, language)}</div></div>}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {nav.map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} title={collapsed ? label(item) : undefined} className={`nav-item ${isActive(item) ? 'active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}>
              <Icon className="h-5 w-5 shrink-0" /><span className={collapsed ? 'hidden' : ''}>{label(item)}</span>
            </Link>
          );
        })}
      </nav>
      <button onClick={async () => { await logout(); router.replace('/login/'); }} className={`nav-item mx-3 mb-4 text-red-400 ${collapsed ? 'justify-center px-0' : ''}`}>
        <LogOut className="h-5 w-5" /><span className={collapsed ? 'hidden' : ''}>{t('Chiqish', 'Выход')}</span>
      </button>
    </>
  );

  return (
    <div className="min-h-screen bg-[#101011] text-white">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/5 bg-[#151516] transition-all lg:flex ${collapsed ? 'w-20' : 'w-64'}`}>{navContent}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-[#151516]">{navContent}<button className="absolute right-3 top-6 text-zinc-400" onClick={() => setOpen(false)}><X /></button></aside>
        </div>
      )}
      <div className={`${collapsed ? 'lg:pl-20' : 'lg:pl-64'} transition-all`}>
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/5 bg-[#101011]/95 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className={`btn-ghost p-2 lg:hidden ${bottomNav ? 'hidden' : ''}`} aria-label="Menu"><Menu className="h-5 w-5" /></button>
            <button onClick={() => setCollapsed(!collapsed)} className="btn-ghost hidden p-2 lg:block" aria-label="Toggle sidebar">{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
            <div><div className="text-sm font-semibold">{currentUser.name}</div><div className="text-xs text-zinc-500">{roleLabel(role, language)}</div></div>
          </div>
          <div className="flex items-center gap-2">
            {(role === 'bar' || role === 'admin') && <button onClick={() => setDeviceOpen(true)} className="btn-ghost p-2" aria-label={t('Printer va signal', 'Принтер и сигналы')} title={t('Printer va signal', 'Принтер и сигналы')}><Printer className="h-5 w-5" /></button>}
            <button onClick={() => setPwOpen(true)} className="btn-ghost p-2" aria-label={t('Parolni o‘zgartirish', 'Сменить пароль')} title={t('Parolni o‘zgartirish', 'Сменить пароль')}><KeyRound className="h-5 w-5" /></button>
            <button onClick={() => setLanguage(language === 'uz' ? 'ru' : 'uz')} className="btn-secondary px-3 py-2 text-xs">{language === 'uz' ? 'RU' : 'UZ'}</button>
            {bottomNav && <button onClick={async () => { await logout(); router.replace('/login/'); }} className="btn-ghost p-2 text-red-400 lg:hidden" aria-label={t('Chiqish', 'Выход')}><LogOut className="h-5 w-5" /></button>}
            <div className="relative" ref={bellRef}>
              <button onClick={() => setBellOpen(value => !value)} className="btn-ghost relative p-2" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-black">{unread > 9 ? '9+' : unread}</span>}
              </button>
              {bellOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1b] shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <span className="text-sm font-semibold">{t('Bildirishnomalar', 'Уведомления')}</span>
                    {unread > 0 && <button onClick={() => markAllNotificationsRead()} className="text-xs text-gold-400 hover:underline">{t('Hammasini o‘qilgan deb belgilash', 'Прочитать все')}</button>}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {mine.length === 0 && <div className="p-6 text-center text-sm text-zinc-500">{t('Bildirishnoma yo‘q', 'Уведомлений нет')}</div>}
                    {mine.slice(0, 30).map(n => (
                      <button key={n.id} onClick={() => markNotificationRead(n.id)} className={`block w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/5 ${n.isRead ? 'opacity-60' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium">{language === 'uz' ? n.title : n.titleRu}</div>
                          {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-500" />}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-400">{language === 'uz' ? n.message : n.messageRu}</div>
                        <div className="mt-1 text-[11px] text-zinc-600">{getTimeAgo(n.createdAt, language)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className={bottomNav ? 'pb-24 lg:pb-0' : ''}>{children}</main>
      </div>

      {(role === 'bar' || role === 'admin') && <OrderWatcher />}
      {(role === 'bar' || role === 'admin') && <DeviceSettings open={deviceOpen} onClose={() => setDeviceOpen(false)} />}

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} size="sm" title={t('Parolni o‘zgartirish', 'Сменить пароль')} footer={<button className="btn-gold min-h-12 w-full" disabled={pwBusy || !oldPw || newPw.length < 6} onClick={submitPassword}>{t('Saqlash', 'Сохранить')}</button>}>
        <div className="space-y-3">
          <input type="password" className="input-dark" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder={t('Joriy parol', 'Текущий пароль')} autoComplete="current-password" />
          <input type="password" className="input-dark" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder={t('Yangi parol (kamida 6 belgi)', 'Новый пароль (минимум 6 символов)')} autoComplete="new-password" />
        </div>
      </Modal>

      {bottomNav && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid border-t border-white/10 bg-[#151516]/95 backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map(item => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link key={item.href} href={item.href} className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium ${active ? 'text-gold-400' : 'text-zinc-500'}`}>
                <Icon className="h-5 w-5" />{label(item)}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
