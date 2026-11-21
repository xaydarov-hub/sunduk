'use client';

import { useEffect, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';
import { getDb } from '@/lib/firebase';
import { nowIso } from '@/lib/clock';
import { loyaltyCall, startBroadcast } from '@/lib/loyalty/api';
import { BroadcastAudience, BroadcastDoc, COL, DEFAULT_LOYALTY } from '@/lib/loyalty/shared';
import { useBroadcasts } from '@/lib/loyalty/useLoyaltyData';
import { Badge, Field, Section } from '@/components/loyalty/ui';
import { MediaPicker, MediaValue, NO_MEDIA } from '@/components/loyalty/MediaPicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type AudienceKind = BroadcastAudience['type'];

export function BroadcastTab() {
  const t = useT();
  const addToast = useStore(state => state.addToast);
  const currentUser = useStore(state => state.currentUser);
  const config = useStore(state => state.loyalty) ?? DEFAULT_LOYALTY;
  const { items: history } = useBroadcasts();

  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaValue>(NO_MEDIA);
  const [buttonText, setButtonText] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [kind, setKind] = useState<AudienceKind>('all');
  const [tier, setTier] = useState(config.tiers[0]?.key ?? 'bronze');
  const [days, setDays] = useState(30);
  const [count, setCount] = useState<number | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const audience: BroadcastAudience = kind === 'tier' ? { type: 'tier', tier } : kind === 'inactive' ? { type: 'inactive', days } : { type: kind } as BroadcastAudience;

  // Auditoriya hajmini ko'rsatamiz
  useEffect(() => {
    let cancelled = false;
    setCount(null);
    const timer = setTimeout(async () => {
      const res = await loyaltyCall<{ count: number }>('audienceCount', { audience });
      if (!cancelled && res.ok) setCount(res.count);
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, tier, days]);

  const valid = (text.trim().length > 0 || !!media.mediaType) && (!buttonText.trim() === !buttonUrl.trim()) && (!buttonUrl.trim() || /^(https?:\/\/|tg:\/\/)/i.test(buttonUrl.trim()));

  const saveDraft = async (): Promise<string | null> => {
    if (!currentUser) return null;
    const id = draftId ?? doc(collection(getDb(), COL.broadcasts)).id;
    const data: Omit<BroadcastDoc, 'id'> & { id: string } = {
      id, text: text.trim(), mediaType: media.mediaType, mediaFileId: media.mediaFileId, mediaUrl: media.mediaUrl,
      buttonText: buttonText.trim(), buttonUrl: buttonUrl.trim(), audience, status: 'draft', total: 0, sent: 0, failed: 0, blocked: 0,
      createdAt: nowIso(), createdBy: currentUser.id,
    };
    try {
      if (draftId) { const { createdAt: _c, createdBy: _b, ...rest } = data; void _c; void _b; await updateDoc(doc(getDb(), COL.broadcasts, id), rest); }
      else await setDoc(doc(getDb(), COL.broadcasts, id), data);
      setDraftId(id);
      return id;
    } catch (error) {
      addToast({ type: 'error', title: t('Saqlanmadi', 'Не сохранено'), message: String((error as Error).message || error) });
      return null;
    }
  };

  const sendTest = async () => {
    setBusy(true);
    const id = await saveDraft();
    if (id) {
      const res = await loyaltyCall<{ results: Array<{ to: string; ok: boolean; error?: string }> }>('testBroadcast', { id });
      if (!res.ok) addToast({ type: 'error', title: t('Sinov yuborilmadi', 'Тест не отправлен'), message: res.error });
      else {
        const bad = res.results.filter(r => !r.ok);
        if (!res.results.length) addToast({ type: 'warning', title: t('Admin Telegram ID kiritilmagan', 'Не указан Telegram ID админа'), message: t('Sozlamalarda ID ni kiriting', 'Укажите ID в настройках') });
        else if (bad.length) addToast({ type: 'error', title: t('Sinov xatosi', 'Ошибка теста'), message: bad[0].error || '' });
        else addToast({ type: 'success', title: t('Sinov xabari Telegramingizga yuborildi', 'Тест отправлен в ваш Telegram'), message: '' });
      }
    }
    setBusy(false);
  };

  const sendAll = async () => {
    setBusy(true);
    const id = await saveDraft();
    if (id) {
      const res = await startBroadcast(id);
      if (!res.ok) addToast({ type: 'error', title: t('Yuborish boshlanmadi', 'Рассылка не запущена'), message: res.error || '' });
      else {
        addToast({ type: 'success', title: t('Yuborish boshlandi', 'Рассылка запущена'), message: t('Jarayon pastda ko‘rinadi', 'Ход рассылки виден ниже') });
        setText(''); setMedia(NO_MEDIA); setButtonText(''); setButtonUrl(''); setDraftId(null);
      }
    }
    setBusy(false);
  };

  const audienceLabel = (a: BroadcastAudience) => {
    switch (a.type) {
      case 'tier': return `${t('Daraja', 'Уровень')}: ${config.tiers.find(x => x.key === a.tier)?.name ?? a.tier}`;
      case 'inactive': return `${a.days} ${t('kun kelmaganlar', 'дн. не был')}`;
      case 'withBalance': return t('Balansi borlar', 'С балансом');
      case 'noPurchase': return t('Hali xarid qilmaganlar', 'Без покупок');
      default: return t('Hammasi', 'Все');
    }
  };
  const statusBadge = (b: BroadcastDoc) => b.status === 'done' ? <Badge tone="green">{t('Tugadi', 'Готово')}</Badge> : b.status === 'sending' ? <Badge tone="amber">{t('Yuborilmoqda…', 'Отправляется…')}</Badge> : b.status === 'failed' ? <Badge tone="red">{t('Xato', 'Ошибка')}</Badge> : <Badge tone="gray">{t('Qoralama', 'Черновик')}</Badge>;

  return (
    <div className="space-y-4">
      <Section title={t('Yangi xabar', 'Новое сообщение')} hint={t('Matnda <b>qalin</b>, <i>kursiv</i>, <a href="…">havola</a> ishlaydi. {ism} — mijoz ismi, {balans} — uning cashback balansi.', 'В тексте работают <b>жирный</b>, <i>курсив</i>, <a href="…">ссылка</a>. {ism} — имя клиента, {balans} — его баланс кэшбэка.')}>
        <Field label={t('Matn', 'Текст')}>
          <textarea rows={6} className="input-dark" value={text} onChange={event => setText(event.target.value)} placeholder={t('Salom {ism}! Bu juma kuni barcha xonalarda 2x cashback 🎤', 'Привет, {ism}! В пятницу двойной кэшбэк во всех комнатах 🎤')} />
        </Field>
        <MediaPicker value={media} onChange={setMedia} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Tugma matni (ixtiyoriy)', 'Текст кнопки (необязательно)')}><input className="input-dark" value={buttonText} onChange={event => setButtonText(event.target.value)} placeholder={t('Xona band qilish', 'Забронировать')} /></Field>
          <Field label={t('Tugma havolasi', 'Ссылка кнопки')}><input className="input-dark" value={buttonUrl} onChange={event => setButtonUrl(event.target.value)} placeholder="https://t.me/…" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('Kimga', 'Кому')}>
            <select className="input-dark" value={kind} onChange={event => setKind(event.target.value as AudienceKind)}>
              <option value="all">{t('Hamma mijozlarga', 'Всем клиентам')}</option>
              <option value="tier">{t('Daraja bo‘yicha', 'По уровню')}</option>
              <option value="inactive">{t('Uzoq kelmaganlarga', 'Давно не были')}</option>
              <option value="withBalance">{t('Balansi borlarga', 'С балансом')}</option>
              <option value="noPurchase">{t('Hali xarid qilmaganlarga', 'Ещё без покупок')}</option>
            </select>
          </Field>
          {kind === 'tier' && <Field label={t('Daraja', 'Уровень')}><select className="input-dark" value={tier} onChange={event => setTier(event.target.value)}>{config.tiers.map(x => <option key={x.key} value={x.key}>{x.name}</option>)}</select></Field>}
          {kind === 'inactive' && <Field label={t('Necha kundan beri', 'Сколько дней')}><input type="number" min={1} className="input-dark" value={days} onChange={event => setDays(Math.max(1, Number(event.target.value)))} /></Field>}
          <div className="flex items-end text-sm text-zinc-400">{count === null ? '…' : <span><b className="text-xl text-white">{count}</b> {t('ta mijozga yuboriladi', 'клиентам будет отправлено')}</span>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={!valid || busy} onClick={sendTest}>{t('Sinov: faqat menga yuborish', 'Тест: отправить только мне')}</button>
          <button type="button" className="btn-gold flex items-center gap-2" disabled={!valid || busy || count === 0} onClick={() => setConfirm(true)}><Send className="h-4 w-4" />{t('Hammaga yuborish', 'Отправить всем')}</button>
        </div>
      </Section>

      <Section title={t('Yuborilganlar', 'История рассылок')}>
        <div className="space-y-2">
          {history.map(b => (
            <div key={b.id} className="rounded-xl bg-white/[.03] p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{b.text ? b.text.replace(/<[^>]+>/g, '').slice(0, 80) : (b.mediaType === 'video' ? 'Video' : t('Rasm', 'Фото'))}</div><div className="text-xs text-zinc-500">{new Date(b.createdAt).toLocaleString('ru-RU')} · {audienceLabel(b.audience)}</div></div>
                {statusBadge(b)}
                {b.status === 'draft' && <button type="button" aria-label="Delete" className="rounded p-2 text-red-400 hover:bg-red-500/15" onClick={() => void deleteDoc(doc(getDb(), COL.broadcasts, b.id))}><Trash2 className="h-4 w-4" /></button>}
              </div>
              {b.status !== 'draft' && (
                <>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gold-500 transition-all" style={{ width: `${b.total ? Math.min(100, ((b.sent + b.failed + b.blocked) / b.total) * 100) : 0}%` }} /></div>
                  <div className="mt-1 text-xs text-zinc-400">{t('Yetkazildi', 'Доставлено')}: {b.sent} / {b.total}{b.blocked ? ` · ${t('botni bloklagan', 'заблокировали бота')}: ${b.blocked}` : ''}{b.failed ? ` · ${t('xato', 'ошибок')}: ${b.failed}` : ''}</div>
                  {b.error && <div className="mt-1 text-xs text-red-300">{b.error}</div>}
                </>
              )}
            </div>
          ))}
          {!history.length && <p className="py-4 text-center text-sm text-zinc-500">{t('Hali xabar yuborilmagan', 'Рассылок пока не было')}</p>}
        </div>
      </Section>

      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void sendAll()}
        title={t('Xabarni yuborish', 'Отправить рассылку')}
        message={<span>{t('Xabar', 'Сообщение получат')} <b>{count ?? '…'}</b> {t('ta mijozga yuboriladi. Bekor qilib bo‘lmaydi.', 'клиентов. Отменить нельзя.')}</span>}
        confirmLabel={t('Yuborish', 'Отправить')}
      />
    </div>
  );
}
