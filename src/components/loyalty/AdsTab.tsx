'use client';

import { useState } from 'react';
import { Megaphone, Pencil, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';
import { getDb } from '@/lib/firebase';
import { nowIso } from '@/lib/clock';
import { AdDoc, COL } from '@/lib/loyalty/shared';
import { useAds } from '@/lib/loyalty/useLoyaltyData';
import { Badge, Field, fromDateInput, toDateInput } from '@/components/loyalty/ui';
import { MediaPicker, MediaValue, NO_MEDIA } from '@/components/loyalty/MediaPicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';

interface Form { title: string; text: string; media: MediaValue; buttonText: string; buttonUrl: string; active: boolean; showAfterClaim: boolean; startsAt: string; endsAt: string; order: number }
const emptyForm = (order: number): Form => ({ title: '', text: '', media: NO_MEDIA, buttonText: '', buttonUrl: '', active: true, showAfterClaim: false, startsAt: '', endsAt: '', order });

/** Reklama / aksiyalar: botdagi “🎁 Aksiyalar” bo‘limida ko‘rinadi; xohlansa har chekdan keyingi xabarga ham qo‘shiladi. */
export function AdsTab() {
  const t = useT();
  const addToast = useStore(state => state.addToast);
  const { items: ads, error } = useAds();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Form>(emptyForm(1));
  const [deleting, setDeleting] = useState<AdDoc | null>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(current => ({ ...current, [key]: value }));
  const startNew = () => { setForm(emptyForm((ads[ads.length - 1]?.order ?? 0) + 1)); setEditing('new'); };
  const startEdit = (ad: AdDoc) => {
    setForm({ title: ad.title, text: ad.text, media: ad.mediaType ? { mediaType: ad.mediaType, mediaFileId: ad.mediaFileId, mediaUrl: ad.mediaUrl } : NO_MEDIA, buttonText: ad.buttonText || '', buttonUrl: ad.buttonUrl || '', active: ad.active, showAfterClaim: ad.showAfterClaim, startsAt: toDateInput(ad.startsAt), endsAt: toDateInput(ad.endsAt), order: ad.order });
    setEditing(ad.id);
  };

  const save = async () => {
    if (!form.title.trim() && !form.text.trim() && !form.media.mediaType) { addToast({ type: 'error', title: t('Sarlavha, matn yoki media kiriting', 'Укажите заголовок, текст или медиа'), message: '' }); return; }
    if (!!form.buttonText.trim() !== !!form.buttonUrl.trim()) { addToast({ type: 'error', title: t('Tugma matni va havolasi birga kerak', 'Нужны и текст кнопки, и ссылка'), message: '' }); return; }
    const id = editing === 'new' || !editing ? doc(collection(getDb(), COL.ads)).id : editing;
    const data: AdDoc = {
      id, title: form.title.trim(), text: form.text.trim(), mediaType: form.media.mediaType, mediaFileId: form.media.mediaFileId, mediaUrl: form.media.mediaUrl,
      buttonText: form.buttonText.trim(), buttonUrl: form.buttonUrl.trim(), active: form.active, showAfterClaim: form.showAfterClaim,
      startsAt: fromDateInput(form.startsAt), endsAt: fromDateInput(form.endsAt, true), order: form.order, createdAt: ads.find(a => a.id === id)?.createdAt ?? nowIso(),
    };
    try {
      await setDoc(doc(getDb(), COL.ads, id), JSON.parse(JSON.stringify(data)));
      addToast({ type: 'success', title: t('Saqlandi', 'Сохранено'), message: '' });
      setEditing(null);
    } catch (e) { addToast({ type: 'error', title: t('Saqlanmadi', 'Не сохранено'), message: String((e as Error).message || e) }); }
  };

  const status = (ad: AdDoc) => {
    const now = Date.now();
    if (!ad.active) return <Badge tone="gray">{t('O‘chiq', 'Выкл.')}</Badge>;
    if (ad.startsAt && Date.parse(ad.startsAt) > now) return <Badge tone="amber">{t('Kutilmoqda', 'Ожидает')}</Badge>;
    if (ad.endsAt && Date.parse(ad.endsAt) < now) return <Badge tone="red">{t('Tugagan', 'Завершена')}</Badge>;
    return <Badge tone="green">{t('Faol', 'Активна')}</Badge>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">{t('Botdagi “🎁 Aksiyalar” bo‘limida ko‘rinadigan reklama va takliflar.', 'Реклама и предложения в разделе «🎁 Акции» бота.')}</p>
        <button type="button" className="btn-gold flex shrink-0 items-center gap-2" onClick={startNew}><Megaphone className="h-4 w-4" />{t('Yangi reklama', 'Новая реклама')}</button>
      </div>
      {error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      <div className="space-y-2">
        {ads.map(ad => (
          <div key={ad.id} className="stat-card flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-semibold">{ad.title || t('(sarlavhasiz)', '(без заголовка)')} {status(ad)} {ad.showAfterClaim && <Badge tone="gray">{t('chekdan keyin ham', 'и после чека')}</Badge>} {ad.mediaType && <Badge tone="gray">{ad.mediaType === 'video' ? 'video' : t('rasm', 'фото')}</Badge>}</div>
              <div className="mt-1 line-clamp-2 text-sm text-zinc-400">{ad.text.replace(/<[^>]+>/g, '')}</div>
              {(ad.startsAt || ad.endsAt) && <div className="mt-1 text-xs text-zinc-600">{toDateInput(ad.startsAt) || '…'} → {toDateInput(ad.endsAt) || '…'}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => void updateDoc(doc(getDb(), COL.ads, ad.id), { active: !ad.active })}>{ad.active ? t('O‘chirish', 'Выключить') : t('Yoqish', 'Включить')}</button>
              <button type="button" aria-label="Edit" className="rounded-lg p-2 hover:bg-white/10" onClick={() => startEdit(ad)}><Pencil className="h-4 w-4" /></button>
              <button type="button" aria-label="Delete" className="rounded-lg p-2 text-red-400 hover:bg-red-500/15" onClick={() => setDeleting(ad)}><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {!ads.length && <div className="stat-card empty-state text-sm text-zinc-500">{t('Hali reklama yo‘q.', 'Рекламы пока нет.')}</div>}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} size="lg" title={editing === 'new' ? t('Yangi reklama', 'Новая реклама') : t('Reklamani tahrirlash', 'Редактирование рекламы')} footer={<div className="grid grid-cols-2 gap-3"><button className="btn-secondary min-h-12" onClick={() => setEditing(null)}>{t('Bekor qilish', 'Отмена')}</button><button className="btn-gold min-h-12" onClick={save}>{t('Saqlash', 'Сохранить')}</button></div>}>
        <div className="space-y-3">
          <Field label={t('Sarlavha', 'Заголовок')}><input className="input-dark" value={form.title} onChange={event => set('title', event.target.value)} /></Field>
          <Field label={t('Matn (<b>, <i>, <a> ishlaydi)', 'Текст (работают <b>, <i>, <a>)')}><textarea rows={4} className="input-dark" value={form.text} onChange={event => set('text', event.target.value)} /></Field>
          <MediaPicker value={form.media} onChange={value => set('media', value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Tugma matni', 'Текст кнопки')}><input className="input-dark" value={form.buttonText} onChange={event => set('buttonText', event.target.value)} /></Field>
            <Field label={t('Tugma havolasi', 'Ссылка кнопки')}><input className="input-dark" value={form.buttonUrl} onChange={event => set('buttonUrl', event.target.value)} placeholder="https://" /></Field>
            <Field label={t('Boshlanishi', 'Начало')}><input type="date" className="input-dark" value={form.startsAt} onChange={event => set('startsAt', event.target.value)} /></Field>
            <Field label={t('Tugashi', 'Окончание')}><input type="date" className="input-dark" value={form.endsAt} onChange={event => set('endsAt', event.target.value)} /></Field>
            <Field label={t('Tartib raqami', 'Порядок')}><input type="number" className="input-dark" value={form.order} onChange={event => set('order', Number(event.target.value))} /></Field>
          </div>
          <Toggle checked={form.active} onChange={value => set('active', value)} label={t('Faol', 'Активна')} />
          <Toggle checked={form.showAfterClaim} onChange={value => set('showAfterClaim', value)} label={t('Chek tasdiqlangandan keyin ham ko‘rsatilsin', 'Показывать и после подтверждения чека')} hint={t('Mijoz cashback olganida xabar oxirida chiqadi — eng ko‘p ko‘riladigan joy', 'Появляется в конце сообщения о кэшбэке — самое просматриваемое место')} />
        </div>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger title={t('Reklamani o‘chirish', 'Удалить рекламу')} message={deleting?.title} confirmLabel={t('O‘chirish', 'Удалить')} onConfirm={() => { if (deleting) void deleteDoc(doc(getDb(), COL.ads, deleting.id)); }} />
    </div>
  );
}
