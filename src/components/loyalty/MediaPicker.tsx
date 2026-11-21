'use client';

import { Film, Image as ImageIcon } from 'lucide-react';
import { useT } from '@/lib/hooks';
import { useMedia } from '@/lib/loyalty/useLoyaltyData';

export interface MediaValue { mediaType: 'photo' | 'video' | null; mediaFileId?: string; mediaUrl?: string }
export const NO_MEDIA: MediaValue = { mediaType: null };

const guessType = (url: string): 'photo' | 'video' => (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? 'video' : 'photo');

/**
 * Rasm/video tanlash. Media kutubxonasi: admin o'z Telegramidan botga rasm/video yuborsa, shu yerda paydo bo'ladi
 * (Telegram serverida saqlanadi — hech qanday qo'shimcha xotira kerak emas, hajm cheklovi yo'q).
 */
export function MediaPicker({ value, onChange }: { value: MediaValue; onChange: (value: MediaValue) => void }) {
  const t = useT();
  const { items, error } = useMedia();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
        <span>{t('Media kutubxonasi', 'Медиатека')}</span>
        {value.mediaType && <button type="button" className="text-xs text-red-300 hover:underline" onClick={() => onChange(NO_MEDIA)}>{t('Mediani olib tashlash', 'Убрать медиа')}</button>}
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
      {items.length === 0 ? (
        <p className="rounded-lg bg-white/[.03] p-3 text-xs text-zinc-500">{t('Hozircha bo‘sh. Rasm yoki videoni o‘zingizning Telegramingizdan botga yuboring — u shu yerda paydo bo‘ladi (videoning hajmi cheklanmaydi).', 'Пока пусто. Отправьте фото или видео боту со своего Telegram — они появятся здесь (размер видео не ограничен).')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map(item => {
            const selected = value.mediaFileId === item.fileId;
            const Icon = item.type === 'video' ? Film : ImageIcon;
            return (
              <button key={item.id} type="button" onClick={() => onChange({ mediaType: item.type, mediaFileId: item.fileId })} className={`rounded-xl border-2 p-3 text-left text-xs ${selected ? 'border-gold-500 bg-gold-500/10' : 'border-white/10 hover:border-white/30'}`}>
                <Icon className="mb-1 h-5 w-5 text-gold-400" />
                <div className="line-clamp-2 min-h-8 font-medium">{item.caption || (item.type === 'video' ? 'Video' : t('Rasm', 'Фото'))}</div>
                <div className="mt-1 text-zinc-500">{new Date(item.createdAt).toLocaleDateString('ru-RU')}</div>
              </button>
            );
          })}
        </div>
      )}
      <input className="input-dark" value={value.mediaUrl || ''} placeholder={t('yoki rasm/video havolasi (https://…)', 'или ссылка на фото/видео (https://…)')} onChange={event => { const url = event.target.value.trim(); onChange(url ? { mediaType: guessType(url), mediaUrl: url } : NO_MEDIA); }} />
    </div>
  );
}
