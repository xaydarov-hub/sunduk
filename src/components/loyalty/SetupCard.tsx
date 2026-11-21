'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';
import { loyaltyCall } from '@/lib/loyalty/api';
import { Section } from '@/components/loyalty/ui';

interface StatusResp {
  botOk: boolean; botUsername: string; botError?: string; webhookUrl: string; pending: number; lastError: string; admins: string[];
  channels: Array<{ channel: string; found: boolean; title: string; botIsAdmin: boolean; error?: string }>;
  env: { token: boolean; secret: boolean; firebase: boolean };
}

const Row = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-sm">
    {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
    <span className={ok ? '' : 'text-red-300'}>{children}</span>
  </div>
);

/** Botning holati: token, webhook, server kaliti, adminlar va majburiy kanallar. "Ulash" tugmasi hammasini bir bosishda sozlaydi. */
export function SetupCard() {
  const t = useT();
  const addToast = useStore(state => state.addToast);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    const res = await loyaltyCall<Omit<StatusResp, 'ok'>>('status');
    setBusy(false);
    if (res.ok) { setStatus(res as unknown as StatusResp); setError(''); } else setError(res.error);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const connect = async () => {
    setBusy(true);
    const res = await loyaltyCall<{ botUsername: string }>('setup');
    setBusy(false);
    if (!res.ok) { addToast({ type: 'error', title: t('Ulanmadi', 'Не удалось подключить'), message: res.error }); return; }
    addToast({ type: 'success', title: t('Bot ulandi', 'Бот подключён'), message: `@${res.botUsername}` });
    void refresh();
  };

  const webhookOk = !!status?.webhookUrl && status.webhookUrl.includes('tg-webhook');
  return (
    <Section title={t('Telegram bot holati', 'Состояние Telegram-бота')}>
      {error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {status && (
        <div className="space-y-2">
          <Row ok={status.env.token}>{t('Bot tokeni serverda saqlangan', 'Токен бота сохранён на сервере')}</Row>
          <Row ok={status.botOk}>{status.botOk ? <>@{status.botUsername} {t('ishlayapti', 'работает')}</> : <>{t('Bot tokeni ishlamayapti', 'Токен бота не работает')}: {status.botError}</>}</Row>
          <Row ok={webhookOk}>{webhookOk ? t('Webhook ulangan', 'Webhook подключён') : t('Webhook ulanmagan — “Botni ulash” tugmasini bosing', 'Webhook не подключён — нажмите «Подключить бота»')}</Row>
          {status.lastError && <Row ok={false}>{t('Telegram xatosi', 'Ошибка Telegram')}: {status.lastError}</Row>}
          {status.pending > 0 && <Row ok={false}>{t('Navbatda kutayotgan xabarlar', 'Ожидающих обновлений')}: {status.pending}</Row>}
          <Row ok={status.env.firebase}>{t('Firebase server kaliti', 'Серверный ключ Firebase')}</Row>
          <Row ok={status.admins.length > 0}>{t('Admin Telegram ID', 'ID админов в Telegram')}: {status.admins.join(', ') || '—'}</Row>
          {status.channels.map(c => (
            <Row key={c.channel} ok={c.found && c.botIsAdmin}>
              {c.channel}{c.title ? ` (${c.title})` : ''}: {!c.found ? t('kanal topilmadi', 'канал не найден') : c.botIsAdmin ? t('bot admin — obuna tekshiriladi', 'бот админ — подписка проверяется') : t('botni kanalga ADMIN qiling, aks holda obuna tekshirilmaydi', 'сделайте бота АДМИНОМ канала, иначе подписка не проверяется')}
            </Row>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={connect} disabled={busy} className="btn-gold flex items-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t('Botni ulash / qayta ulash', 'Подключить / переподключить бота')}</button>
        <button type="button" onClick={refresh} disabled={busy} className="btn-secondary flex items-center gap-2"><RefreshCw className="h-4 w-4" />{t('Yangilash', 'Обновить')}</button>
      </div>
      <p className="text-xs text-zinc-500">{t('Rasm/video yuborish uchun: o‘zingizning Telegram akkauntingizdan botga rasm yoki video jo‘nating — u “Media kutubxonasi”da paydo bo‘ladi.', 'Чтобы отправлять фото/видео: пришлите их боту со своего Telegram — они появятся в «Медиатеке».')}</p>
    </Section>
  );
}
