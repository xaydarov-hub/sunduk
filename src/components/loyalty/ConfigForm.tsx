'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';
import { getDb } from '@/lib/firebase';
import { nowIso } from '@/lib/clock';
import { formatCurrency } from '@/lib/utils';
import { COL, DEFAULT_LOYALTY, LoyaltyConfig, LoyaltyTier } from '@/lib/loyalty/shared';
import { Field, NumberField, Section } from '@/components/loyalty/ui';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Toggle } from '@/components/ui/Toggle';

const WEEKDAYS = [{ n: 1, uz: 'Du', ru: 'Пн' }, { n: 2, uz: 'Se', ru: 'Вт' }, { n: 3, uz: 'Ch', ru: 'Ср' }, { n: 4, uz: 'Pa', ru: 'Чт' }, { n: 5, uz: 'Ju', ru: 'Пт' }, { n: 6, uz: 'Sh', ru: 'Сб' }, { n: 0, uz: 'Ya', ru: 'Вс' }];
const lines = (text: string) => text.split(/[\n,]/).map(s => s.trim()).filter(Boolean);

/** `avgReceipt` — o'rtacha chek summasi (so'm); dastur narxini hisoblash uchun. */
export function ConfigForm({ avgReceipt }: { avgReceipt: number }) {
  const t = useT();
  const language = useStore(state => state.language);
  const stored = useStore(state => state.loyalty);
  const addToast = useStore(state => state.addToast);
  const [draft, setDraft] = useState<LoyaltyConfig>(stored ?? DEFAULT_LOYALTY);
  const [channelsText, setChannelsText] = useState('');
  const [adminsText, setAdminsText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const base = stored ?? DEFAULT_LOYALTY;
    setDraft(base);
    setChannelsText(base.channels.join('\n'));
    setAdminsText(base.adminChatIds.join('\n'));
  }, [stored]);

  const set = <K extends keyof LoyaltyConfig>(key: K, value: LoyaltyConfig[K]) => setDraft(current => ({ ...current, [key]: value }));
  const setTier = (index: number, patch: Partial<LoyaltyTier>) => set('tiers', draft.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  const setPrize = (index: number, value: number) => set('spinPrizes', draft.spinPrizes.map((p, i) => (i === index ? Math.max(0, value) : p)));
  const toggleDay = (n: number) => set('boost', { ...draft.boost, weekdays: draft.boost.weekdays.includes(n) ? draft.boost.weekdays.filter(d => d !== n) : [...draft.boost.weekdays, n] });

  // Dastur narxi: chek summasiga nisbatan necha foiz xarajat
  const cost = useMemo(() => {
    const receipt = avgReceipt > 0 ? avgReceipt : 300000;
    const base = draft.tiers[0]?.percent ?? 0;
    const spinAvg = draft.spinPrizes.reduce((s, p) => s + p, 0) / 6;
    const spin = ((draft.spinsPerReceipt * spinAvg) / receipt) * 100;
    return { receipt, base, spin, total: base + spin };
  }, [draft, avgReceipt]);

  const save = async () => {
    const tiers = [...draft.tiers].map(tier => ({ ...tier, name: tier.name.trim() || 'Daraja', nameRu: tier.nameRu.trim() || tier.name.trim() || 'Уровень', minSpent: Math.max(0, Math.round(tier.minSpent)), percent: Math.max(0, Math.min(50, Number(tier.percent) || 0)) })).sort((a, b) => a.minSpent - b.minSpent);
    if (!tiers.length) { addToast({ type: 'error', title: t('Kamida bitta daraja kerak', 'Нужен хотя бы один уровень'), message: '' }); return; }
    tiers[0].minSpent = 0;
    const channels = lines(channelsText).map(c => (c.startsWith('@') || /^-?\d+$/.test(c) ? c : `@${c}`));
    const adminChatIds = lines(adminsText).filter(id => /^\d+$/.test(id));
    const payload: LoyaltyConfig = { ...draft, tiers, channels, adminChatIds, updatedAt: nowIso() };
    setSaving(true);
    try {
      await setDoc(doc(getDb(), COL.config, 'config'), payload, { merge: true });
      addToast({ type: 'success', title: t('Saqlandi', 'Сохранено'), message: t('Sodiqlik sozlamalari yangilandi', 'Настройки лояльности обновлены') });
    } catch (error) {
      addToast({ type: 'error', title: t('Saqlanmadi', 'Не сохранено'), message: String((error as Error).message || error) });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Section title={t('Dastur', 'Программа')}>
        <Toggle checked={draft.enabled} onChange={value => set('enabled', value)} label={t('Sodiqlik dasturi yoqilgan', 'Программа лояльности включена')} hint={t('O‘chirilsa — chekda QR chiqmaydi, bot cashback bermaydi', 'Если выключить — QR на чеке не печатается, бот не начисляет кэшбэк')} />
        <div className={`rounded-xl p-4 text-sm ${cost.total > 8 ? 'bg-red-500/10 text-red-200' : 'bg-green-500/10 text-green-200'}`}>
          <div className="font-semibold">{t('Dastur narxi (chek summasiga nisbatan)', 'Стоимость программы (от суммы чека)')}: ≈ {cost.total.toFixed(1)}%</div>
          <div className="mt-1 text-xs opacity-80">
            {t('Cashback', 'Кэшбэк')} {cost.base}% + {t('o‘yin sovg‘alari', 'призы игры')} {cost.spin.toFixed(1)}% ({t('o‘rtacha chek', 'средний чек')} {formatCurrency(cost.receipt)}). {t('Yuqori darajalar va aksiya kunlari qo‘shimcha xarajat qo‘shadi.', 'Высокие уровни и акционные дни добавляют расходы.')}
          </div>
        </div>
      </Section>

      <Section title={t('Cashback darajalari', 'Уровни кэшбэка')} hint={t('Mijoz jami xarid qilgan summaga qarab daraja oladi va foizi oshadi — qaytib kelishga undaydi.', 'Уровень зависит от суммы покупок клиента — стимул возвращаться.')}>
        <div className="space-y-2">
          {draft.tiers.map((tier, index) => (
            <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1.3fr_90px_40px]">
              <Field label={index === 0 ? 'UZ' : ''}><input className="input-dark" value={tier.name} onChange={event => setTier(index, { name: event.target.value, key: tier.key || `t${index}` })} /></Field>
              <Field label={index === 0 ? 'RU' : ''}><input className="input-dark" value={tier.nameRu} onChange={event => setTier(index, { nameRu: event.target.value })} /></Field>
              <Field label={index === 0 ? t('Jami xariddan', 'От суммы покупок') : ''}><MoneyInput value={tier.minSpent} onChange={value => setTier(index, { minSpent: index === 0 ? 0 : value })} /></Field>
              <Field label={index === 0 ? '%' : ''}><input type="number" min={0} max={50} step={0.5} className="input-dark" value={tier.percent} onChange={event => setTier(index, { percent: Number(event.target.value) })} /></Field>
              <button type="button" disabled={draft.tiers.length <= 1} onClick={() => set('tiers', draft.tiers.filter((_, i) => i !== index))} className="mb-1 rounded-lg p-2 text-red-400 hover:bg-red-500/15 disabled:opacity-30" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        {draft.tiers.length < 5 && (
          <button type="button" className="btn-secondary flex items-center gap-2 text-sm" onClick={() => set('tiers', [...draft.tiers, { key: `t${Date.now().toString(36)}`, name: 'Yangi daraja', nameRu: 'Новый уровень', minSpent: (draft.tiers[draft.tiers.length - 1]?.minSpent ?? 0) + 5_000_000, percent: (draft.tiers[draft.tiers.length - 1]?.percent ?? 3) + 1 }])}><Plus className="h-4 w-4" />{t('Daraja qo‘shish', 'Добавить уровень')}</button>
        )}
      </Section>

      <Section title={t('Sust kunlarni to‘ldirish', 'Заполнение «тихих» дней')} hint={t('Tanlangan hafta kunlarida cashback foizi oshadi — mijozlarni bo‘sh kunlarga jalb qilish uchun.', 'В выбранные дни недели кэшбэк выше — привлекает гостей в «тихие» дни.')}>
        <Toggle checked={draft.boost.enabled} onChange={value => set('boost', { ...draft.boost, enabled: value })} label={t('Aksiya kunlari yoqilgan', 'Акционные дни включены')} />
        {draft.boost.enabled && (
          <>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(day => (
                <button key={day.n} type="button" onClick={() => toggleDay(day.n)} className={`h-11 min-w-11 rounded-xl border-2 px-3 font-bold ${draft.boost.weekdays.includes(day.n) ? 'border-gold-500 bg-gold-500 text-black' : 'border-white/10 text-zinc-400'}`}>{language === 'uz' ? day.uz : day.ru}</button>
              ))}
            </div>
            <div className="max-w-xs"><NumberField label={t('Qo‘shimcha foiz', 'Дополнительный %')} value={draft.boost.extraPercent} min={0} max={20} suffix="%" onChange={value => set('boost', { ...draft.boost, extraPercent: value })} /></div>
          </>
        )}
      </Section>

      <Section title={t('Bonuslar', 'Бонусы')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('Xush kelibsiz bonusi (birinchi chekda)', 'Приветственный бонус (с первого чека)')}><MoneyInput value={draft.welcomeBonus} onChange={value => set('welcomeBonus', value)} /></Field>
          <Field label={t('Taklif qilgan do‘stga bonus', 'Бонус пригласившему')}><MoneyInput value={draft.referralInviterBonus} onChange={value => set('referralInviterBonus', value)} /></Field>
          <Field label={t('Taklif qilingan mijozga qo‘shimcha', 'Доп. бонус приглашённому')}><MoneyInput value={draft.referralInviteeBonus} onChange={value => set('referralInviteeBonus', value)} /></Field>
          <Field label={t('Tug‘ilgan kun sovg‘asi (0 — o‘chiq)', 'Подарок на день рождения (0 — выкл.)')}><MoneyInput value={draft.birthdayBonus} onChange={value => set('birthdayBonus', value)} /></Field>
        </div>
      </Section>

      <Section title={t('Omad o‘yini (🎲)', 'Игра удачи (🎲)')} hint={t('Har bir tasdiqlangan chek mijozga urinish beradi — o‘yin faqat xarid qilganlar uchun, shuning uchun xarajat nazoratda.', 'Каждый подтверждённый чек даёт попытку — игра только для покупателей, расходы под контролем.')}>
        <div className="max-w-xs"><NumberField label={t('Har chekka urinishlar soni', 'Попыток за чек')} value={draft.spinsPerReceipt} min={0} max={5} onChange={value => set('spinsPerReceipt', value)} /></div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {draft.spinPrizes.map((prize, index) => (
            <Field key={index} label={`🎲 ${index + 1}`}><MoneyInput value={prize} onChange={value => setPrize(index, value)} /></Field>
          ))}
        </div>
      </Section>

      <Section title={t('Cashbackni ishlatish va muddat', 'Использование и срок')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label={t('Bir chekning necha % igacha cashback bilan to‘lash mumkin', 'До скольких % чека можно оплатить кэшбэком')} value={draft.maxRedeemPercent} min={0} max={100} suffix="%" onChange={value => set('maxRedeemPercent', value)} />
          <Field label={t('Minimal ishlatish summasi', 'Минимальная сумма списания')}><MoneyInput value={draft.minRedeemAmount} onChange={value => set('minRedeemAmount', value)} /></Field>
          <NumberField label={t('Chekni skanerlash muddati', 'Срок сканирования чека')} value={draft.claimWindowHours} min={1} max={720} suffix={t('soat', 'ч')} onChange={value => set('claimWindowHours', value)} />
          <NumberField label={t('Shuncha kun kelmasa balans kuyadi (0 — kuymaydi)', 'Баланс сгорает без визитов (0 — не сгорает)')} value={draft.expiryDays} min={0} max={720} suffix={t('kun', 'дн')} onChange={value => set('expiryDays', value)} />
          <NumberField label={t('Kuyishdan necha kun oldin ogohlantirish', 'За сколько дней предупреждать')} value={draft.expiryWarnDays} min={0} max={60} suffix={t('kun', 'дн')} onChange={value => set('expiryWarnDays', value)} />
          <NumberField label={t('“Sog‘indik” xabari: kelmagan kunlar (0 — o‘chiq)', 'Сообщение «скучаем»: дней без визита (0 — выкл.)')} value={draft.winbackDays} min={0} max={365} suffix={t('kun', 'дн')} onChange={value => set('winbackDays', value)} />
        </div>
      </Section>

      <Section title={t('Xavfsizlik va xabarnomalar', 'Безопасность и уведомления')}>
        <Toggle checked={draft.requirePhone} onChange={value => set('requirePhone', value)} label={t('Telefon raqamni tasdiqlash shart', 'Требовать подтверждение телефона')} hint={t('Bitta raqam — bitta hisob (firibgarlikdan himoya) va sizga mijozlar bazasi yig‘iladi', 'Один номер — один аккаунт (защита от абьюза) и у вас собирается база клиентов')} />
        <Toggle checked={draft.notifyLowRating} onChange={value => set('notifyLowRating', value)} label={t('Past bahoni darhol menga yuborish', 'Сразу присылать низкие оценки мне')} hint={t('Xona, ofitsiant va mijoz ma’lumoti bilan', 'С комнатой, официантом и данными клиента')} />
        {draft.notifyLowRating && <div className="max-w-xs"><NumberField label={t('Shu bahodan past yoki teng bo‘lsa', 'Если оценка не выше')} value={draft.ratingThreshold} min={1} max={4} suffix="⭐" onChange={value => set('ratingThreshold', value)} /></div>}
        <Toggle checked={draft.dailySummary} onChange={value => set('dailySummary', value)} label={t('Har kuni ertalab hisobot (Telegramga)', 'Ежедневный отчёт утром (в Telegram)')} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('Admin Telegram ID lari (har biri alohida qatorda)', 'Telegram ID админов (по одному в строке)')} hint={t('Hisobot, past baho va media qabul qilish shu ID larga. ID ni @userinfobot dan bilib olasiz.', 'Отчёты, низкие оценки и приём медиа — на эти ID. ID можно узнать у @userinfobot.')}>
            <textarea rows={3} className="input-dark" value={adminsText} onChange={event => setAdminsText(event.target.value)} />
          </Field>
          <Field label={t('Majburiy obuna kanallari (@username, har biri alohida qatorda)', 'Обязательные каналы (@username, по одному в строке)')} hint={t('Bo‘sh qoldirsangiz — obuna talab qilinmaydi. Botni kanalga ADMIN qilib qo‘shing.', 'Пусто — подписка не требуется. Добавьте бота в канал АДМИНОМ.')}>
            <textarea rows={3} className="input-dark" value={channelsText} onChange={event => setChannelsText(event.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title={t('Bot matnlari', 'Тексты бота')} hint={t('Bo‘sh qoldirilsa — standart matn. {ism} — mijoz ismi.', 'Пусто — стандартный текст. {ism} — имя клиента.')}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('Salomlashuv (UZ)', 'Приветствие (UZ)')}><textarea rows={4} className="input-dark" value={draft.welcomeText} onChange={event => set('welcomeText', event.target.value)} /></Field>
          <Field label={t('Salomlashuv (RU)', 'Приветствие (RU)')}><textarea rows={4} className="input-dark" value={draft.welcomeTextRu} onChange={event => set('welcomeTextRu', event.target.value)} /></Field>
          <Field label={t('“Aloqa” bo‘limiga qo‘shimcha matn', 'Доп. текст в «Контактах»')}><textarea rows={3} className="input-dark" value={draft.aboutExtra} onChange={event => set('aboutExtra', event.target.value)} /></Field>
          <Field label={t('Xarita havolasi (Google/Yandex)', 'Ссылка на карту')}><input className="input-dark" value={draft.mapUrl} onChange={event => set('mapUrl', event.target.value)} placeholder="https://maps.app.goo.gl/…" /></Field>
        </div>
      </Section>

      <div className="sticky bottom-3 z-10 flex justify-end">
        <button type="button" onClick={save} disabled={saving} className="btn-gold flex items-center gap-2 shadow-2xl"><Save className="h-4 w-4" />{saving ? '…' : t('Saqlash', 'Сохранить')}</button>
      </div>
    </div>
  );
}
