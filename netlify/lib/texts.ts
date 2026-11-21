// Bot matnlari (o'zbek / rus). Telegram HTML parse_mode — foydalanuvchi ismlari esc() bilan tozalanadi.
import { BotLang, LoyaltyConfig, LoyaltyTier, LoyaltyUser, formatMoney, nextTier, tierByKey } from '../../src/lib/loyalty/shared';
import { esc } from './tg';
import type { ClaimOutcome } from './ledger';

export const MENU_KEYS = ['balance', 'scan', 'spin', 'redeem', 'invite', 'history', 'promos', 'birthday', 'about', 'lang'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

const MENU: Record<BotLang, Record<MenuKey, string>> = {
  uz: {
    balance: '💰 Balans', scan: '📷 Chek skanerlash', spin: '🎰 Omad o‘yini', redeem: '💳 Cashback ishlatish', invite: '👥 Do‘st taklif qilish',
    history: '📜 Tarix', promos: '🎁 Aksiyalar', birthday: '🎂 Tug‘ilgan kun', about: 'ℹ️ Aloqa', lang: '🌐 Til / Язык',
  },
  ru: {
    balance: '💰 Баланс', scan: '📷 Сканировать чек', spin: '🎰 Игра удачи', redeem: '💳 Потратить кэшбэк', invite: '👥 Пригласить друга',
    history: '📜 История', promos: '🎁 Акции', birthday: '🎂 День рождения', about: 'ℹ️ Контакты', lang: '🌐 Til / Язык',
  },
};

export function menuLabels(lang: BotLang) { return MENU[lang]; }

/** Tugma matnidan amal kalitini topadi (ikki tilda ham). */
export function matchMenu(text: string): MenuKey | null {
  const clean = text.trim();
  for (const lang of ['uz', 'ru'] as BotLang[]) {
    for (const key of MENU_KEYS) if (MENU[lang][key] === clean) return key;
  }
  return null;
}

export function mainKeyboard(lang: BotLang) {
  const m = MENU[lang];
  return {
    keyboard: [[{ text: m.balance }, { text: m.scan }], [{ text: m.spin }, { text: m.redeem }], [{ text: m.invite }, { text: m.history }], [{ text: m.promos }, { text: m.birthday }], [{ text: m.about }, { text: m.lang }]],
    resize_keyboard: true, is_persistent: true,
  };
}

export const tierName = (t: LoyaltyTier, lang: BotLang) => (lang === 'ru' ? t.nameRu : t.name);

export function bar(ratio: number, size = 10): string {
  const filled = Math.max(0, Math.min(size, Math.round(ratio * size)));
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const when = (iso: string) => { const d = new Date(Date.parse(iso) + 5 * 3600 * 1000); return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`; };
const money = (n: number, lang: BotLang) => (lang === 'ru' ? formatMoney(n).replace('so\'m', 'сум') : formatMoney(n));

export function tierProgress(cfg: LoyaltyConfig, user: Pick<LoyaltyUser, 'tier' | 'totalSpent'>, lang: BotLang): string {
  const cur = tierByKey(cfg, user.tier);
  const next = nextTier(cfg, user.totalSpent || 0);
  if (!next) return lang === 'ru' ? `🏆 Высший уровень — ${tierName(cur, lang)} (${cur.percent}%)` : `🏆 Eng yuqori daraja — ${tierName(cur, lang)} (${cur.percent}%)`;
  const span = Math.max(1, next.minSpent - cur.minSpent);
  const done = Math.max(0, (user.totalSpent || 0) - cur.minSpent);
  const left = next.minSpent - (user.totalSpent || 0);
  return lang === 'ru'
    ? `${bar(done / span)}\nДо уровня «${tierName(next, lang)}» (${next.percent}%): ещё ${money(left, lang)}`
    : `${bar(done / span)}\n«${tierName(next, lang)}» darajasigacha (${next.percent}%): yana ${money(left, lang)}`;
}

export const T = {
  welcome(lang: BotLang, name: string, cfg: LoyaltyConfig, bizName: string): string {
    const custom = (lang === 'ru' ? cfg.welcomeTextRu : cfg.welcomeText).trim();
    if (custom) return custom.replace(/\{ism\}|\{name\}/g, esc(name));
    const base = cfg.tiers[0]?.percent ?? 3;
    return lang === 'ru'
      ? `👋 Привет, <b>${esc(name)}</b>!\n\nДобро пожаловать в <b>${esc(bizName)}</b>. Сканируйте QR-код на чеке — и получайте <b>${base}% кэшбэка</b>, который можно потратить при следующем визите.\n\n🎰 За каждый чек — попытка в игре удачи\n👥 Приглашайте друзей — получайте бонусы\n🏆 Чем больше ходите — тем выше уровень и кэшбэк`
      : `👋 Salom, <b>${esc(name)}</b>!\n\n<b>${esc(bizName)}</b> ga xush kelibsiz. Chekdagi QR kodni skanerlang — xaridingizning <b>${base}% cashback</b>i hisobingizga tushadi va keyingi tashrifda ishlatasiz.\n\n🎰 Har bir chek — omad o‘yiniga urinish\n👥 Do‘stlarni taklif qiling — bonus oling\n🏆 Ko‘p kelsangiz — daraja va cashback oshadi`;
  },
  askPhone: (lang: BotLang) => (lang === 'ru'
    ? '📱 Чтобы начислить кэшбэк, подтвердите номер телефона — нажмите кнопку ниже. (Один номер — один аккаунт.)'
    : '📱 Cashback hisoblash uchun telefon raqamingizni tasdiqlang — pastdagi tugmani bosing. (Bitta raqam — bitta hisob.)'),
  sharePhoneBtn: (lang: BotLang) => (lang === 'ru' ? '📱 Отправить номер' : '📱 Raqamni yuborish'),
  phoneSaved: (lang: BotLang) => (lang === 'ru' ? '✅ Номер подтверждён.' : '✅ Raqam tasdiqlandi.'),
  phoneTaken: (lang: BotLang) => (lang === 'ru' ? '⚠️ Этот номер уже привязан к другому аккаунту.' : '⚠️ Bu raqam boshqa hisobga biriktirilgan.'),
  phoneNotOwn: (lang: BotLang) => (lang === 'ru' ? '⚠️ Отправьте именно свой номер кнопкой ниже.' : '⚠️ Faqat o‘zingizning raqamingizni pastdagi tugma orqali yuboring.'),
  gate: (lang: BotLang, channels: string[]) => (lang === 'ru'
    ? `📢 Для участия подпишитесь на наши каналы:\n${channels.map(c => `• ${esc(c)}`).join('\n')}\n\nПосле подписки нажмите «Проверить».`
    : `📢 Qatnashish uchun kanallarimizga obuna bo‘ling:\n${channels.map(c => `• ${esc(c)}`).join('\n')}\n\nObuna bo‘lgach «Tekshirish» tugmasini bosing.`),
  gateCheck: (lang: BotLang) => (lang === 'ru' ? '✅ Проверить' : '✅ Tekshirish'),
  gateOpen: (lang: BotLang, c: string) => (lang === 'ru' ? `➡️ ${c}` : `➡️ ${c}`),
  gateFail: (lang: BotLang) => (lang === 'ru' ? 'Вы ещё не подписались на все каналы.' : 'Hali barcha kanallarga obuna bo‘lmadingiz.'),

  claimOk(lang: BotLang, o: ClaimOutcome, cfg: LoyaltyConfig, ad?: string): string {
    const tier = tierByKey(cfg, o.tierAfter);
    const lines: string[] = [];
    lines.push(lang === 'ru' ? `✅ <b>Чек ${esc(o.receiptNumber)} подтверждён!</b>` : `✅ <b>${esc(o.receiptNumber)} chek tasdiqlandi!</b>`);
    lines.push(lang === 'ru' ? `🧾 Сумма: ${money(o.amount, lang)}` : `🧾 Summa: ${money(o.amount, lang)}`);
    lines.push(lang === 'ru'
      ? `💸 Кэшбэк (${o.percent}%${o.boosted ? ' — акционный день 🔥' : ''}): <b>+${money(o.cashback, lang)}</b>`
      : `💸 Cashback (${o.percent}%${o.boosted ? ' — aksiya kuni 🔥' : ''}): <b>+${money(o.cashback, lang)}</b>`);
    if (o.welcome) lines.push(lang === 'ru' ? `🎁 Приветственный бонус: +${money(o.welcome, lang)}` : `🎁 Xush kelibsiz bonusi: +${money(o.welcome, lang)}`);
    if (o.inviteeBonus) lines.push(lang === 'ru' ? `👥 Бонус за приглашение: +${money(o.inviteeBonus, lang)}` : `👥 Taklif bonusi: +${money(o.inviteeBonus, lang)}`);
    lines.push('');
    lines.push(lang === 'ru' ? `💰 Ваш баланс: <b>${money(o.balance, lang)}</b>` : `💰 Balansingiz: <b>${money(o.balance, lang)}</b>`);
    lines.push(lang === 'ru' ? `🏅 Уровень: ${esc(tierName(tier, lang))}` : `🏅 Daraja: ${esc(tierName(tier, lang))}`);
    if (o.tierAfter !== o.tierBefore) lines.push(lang === 'ru' ? `🎉 <b>Поздравляем! Вы достигли нового уровня — ${esc(tierName(tier, lang))} (${tier.percent}%)</b>` : `🎉 <b>Tabriklaymiz! Yangi daraja — ${esc(tierName(tier, lang))} (${tier.percent}%)</b>`);
    if (cfg.spinsPerReceipt > 0) lines.push(lang === 'ru' ? `🎰 +${cfg.spinsPerReceipt} попытка в игре удачи (всего: ${o.spinTickets})` : `🎰 +${cfg.spinsPerReceipt} omad urinishi (jami: ${o.spinTickets})`);
    if (ad) lines.push('', ad);
    return lines.join('\n');
  },
  claimErr(lang: BotLang, code: string): string {
    const map: Record<string, [string, string]> = {
      NOT_FOUND: ['❌ Bu QR kod topilmadi. Chekdagi QR kodni qayta skanerlang.', '❌ QR-код не найден. Отсканируйте QR на чеке ещё раз.'],
      USED: ['⚠️ Bu chek allaqachon boshqa hisobga qo‘shilgan.', '⚠️ Этот чек уже зачтён на другой аккаунт.'],
      USED_BY_YOU: ['ℹ️ Bu chek sizning hisobingizga allaqachon qo‘shilgan.', 'ℹ️ Этот чек уже зачтён на ваш аккаунт.'],
      EXPIRED: ['⏰ Bu chekning skanerlash muddati o‘tgan.', '⏰ Срок сканирования этого чека истёк.'],
      INVALID: ['❌ Chekni tasdiqlab bo‘lmadi. Kassirga murojaat qiling.', '❌ Не удалось подтвердить чек. Обратитесь к кассиру.'],
      BLOCKED: ['⛔ Hisobingiz bloklangan.', '⛔ Ваш аккаунт заблокирован.'],
    };
    const pair = map[code] ?? ['⚠️ Xatolik yuz berdi. Keyinroq urinib ko‘ring.', '⚠️ Произошла ошибка. Попробуйте позже.'];
    return lang === 'ru' ? pair[1] : pair[0];
  },
  scanHelp: (lang: BotLang) => (lang === 'ru'
    ? '📷 Наведите камеру телефона на QR-код внизу чека — бот откроется сам, и кэшбэк будет начислен. Или отправьте мне код из чека.'
    : '📷 Telefon kamerasini chek pastidagi QR kodga qarating — bot o‘zi ochiladi va cashback hisobingizga tushadi. Yoki chekdagi kodni shu yerga yuboring.'),

  balance(lang: BotLang, u: LoyaltyUser, cfg: LoyaltyConfig): string {
    const tier = tierByKey(cfg, u.tier);
    const lines = [
      lang === 'ru' ? `💰 <b>Баланс: ${money(u.balance || 0, lang)}</b>` : `💰 <b>Balans: ${money(u.balance || 0, lang)}</b>`,
      lang === 'ru' ? `🏅 Уровень: <b>${esc(tierName(tier, lang))}</b> — ${tier.percent}% кэшбэка` : `🏅 Daraja: <b>${esc(tierName(tier, lang))}</b> — ${tier.percent}% cashback`,
      tierProgress(cfg, u, lang),
      '',
      lang === 'ru' ? `🧾 Визитов: ${u.claims || 0} · Потрачено: ${money(u.totalSpent || 0, lang)}` : `🧾 Tashriflar: ${u.claims || 0} · Xaridlar: ${money(u.totalSpent || 0, lang)}`,
      lang === 'ru' ? `🎰 Попыток в игре: ${u.spinTickets || 0} · 👥 Приглашено: ${u.refCount || 0}` : `🎰 O‘yin urinishlari: ${u.spinTickets || 0} · 👥 Taklif qilinganlar: ${u.refCount || 0}`,
    ];
    if (cfg.expiryDays > 0 && (u.balance || 0) > 0) lines.push(lang === 'ru' ? `⏳ Баланс сгорает, если не заходить ${cfg.expiryDays} дней.` : `⏳ ${cfg.expiryDays} kun kelmasangiz balans kuyadi.`);
    return lines.join('\n');
  },

  spinIntro: (lang: BotLang, tickets: number) => (lang === 'ru' ? `🎰 <b>Игра удачи</b>\nУ вас попыток: <b>${tickets}</b>. Бросайте кубик — чем больше очков, тем больше приз!` : `🎰 <b>Omad o‘yini</b>\nUrinishlaringiz: <b>${tickets}</b>. Zar tashlang — ochko qancha ko‘p bo‘lsa, sovg‘a shuncha katta!`),
  spinNone: (lang: BotLang, per: number) => (lang === 'ru' ? `🎟 Попыток нет. Каждый подтверждённый чек даёт ${per} попытку — отсканируйте QR на чеке.` : `🎟 Urinish yo‘q. Har bir tasdiqlangan chek ${per} ta urinish beradi — chekdagi QR ni skanerlang.`),
  spinBtn: (lang: BotLang) => (lang === 'ru' ? '🎲 Бросить кубик' : '🎲 Zar tashlash'),
  spinResult: (lang: BotLang, dice: number, prize: number, balance: number, tickets: number) => (lang === 'ru'
    ? `🎲 Выпало: <b>${dice}</b>\n${prize > 0 ? `🎉 Вы выиграли <b>${money(prize, lang)}</b>!` : 'В этот раз без приза.'}\n💰 Баланс: ${money(balance, lang)}${tickets > 0 ? `\n🎟 Осталось попыток: ${tickets}` : ''}`
    : `🎲 Tushdi: <b>${dice}</b>\n${prize > 0 ? `🎉 Siz <b>${money(prize, lang)}</b> yutdingiz!` : 'Bu safar sovg‘a chiqmadi.'}\n💰 Balans: ${money(balance, lang)}${tickets > 0 ? `\n🎟 Qolgan urinishlar: ${tickets}` : ''}`),

  redeem(lang: BotLang, code: string, u: LoyaltyUser, cfg: LoyaltyConfig): string {
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    return lang === 'ru'
      ? `💳 <b>Код для кассы: ${spaced}</b>\nСкажите его кассиру в течение 10 минут.\n\n💰 Доступно: ${money(u.balance || 0, lang)}\nОдним чеком можно оплатить до ${cfg.maxRedeemPercent}% суммы.`
      : `💳 <b>Kassa kodi: ${spaced}</b>\nBuni 10 daqiqa ichida kassirga ayting.\n\n💰 Mavjud: ${money(u.balance || 0, lang)}\nBitta chekning ${cfg.maxRedeemPercent}% igacha cashback bilan to‘lash mumkin.`;
  },
  redeemEmpty: (lang: BotLang) => (lang === 'ru' ? '💳 На балансе пока нет средств. Отсканируйте QR на чеке — и кэшбэк появится здесь.' : '💳 Balansda hozircha mablag‘ yo‘q. Chekdagi QR ni skanerlang — cashback shu yerda paydo bo‘ladi.'),
  redeemUsed: (lang: BotLang, amount: number, balance: number) => (lang === 'ru' ? `✅ Оплачено кэшбэком: <b>${money(amount, lang)}</b>\n💰 Остаток: ${money(balance, lang)}` : `✅ Cashback bilan to‘landi: <b>${money(amount, lang)}</b>\n💰 Qoldiq: ${money(balance, lang)}`),

  history(lang: BotLang, rows: Array<{ type: string; amount: number; createdAt: string; receiptNumber?: string; note?: string }>): string {
    if (!rows.length) return lang === 'ru' ? '📜 История пока пуста.' : '📜 Tarix hozircha bo‘sh.';
    const label: Record<string, [string, string]> = {
      earn: ['Cashback', 'Кэшбэк'], welcome: ['Xush kelibsiz', 'Приветствие'], referral: ['Taklif', 'Приглашение'], spin: ['Omad o‘yini', 'Игра удачи'],
      birthday: ['Tug‘ilgan kun', 'День рождения'], redeem: ['Ishlatildi', 'Потрачено'], refund: ['Qaytarildi', 'Возврат'], expire: ['Muddati o‘tdi', 'Сгорело'], admin: ['Tuzatish', 'Корректировка'],
    };
    const list = rows.map(r => {
      const l = label[r.type] ?? [r.type, r.type];
      const sign = r.amount >= 0 ? '+' : '−';
      return `${r.amount >= 0 ? '🟢' : '🔴'} ${when(r.createdAt)} · ${lang === 'ru' ? l[1] : l[0]}${r.receiptNumber ? ` (${esc(r.receiptNumber)})` : ''}: <b>${sign}${money(Math.abs(r.amount), lang)}</b>`;
    });
    return `📜 <b>${lang === 'ru' ? 'Последние операции' : 'So‘nggi amallar'}</b>\n\n${list.join('\n')}`;
  },

  invite(lang: BotLang, link: string, cfg: LoyaltyConfig, u: LoyaltyUser): string {
    const a = cfg.referralInviterBonus;
    const b = cfg.referralInviteeBonus + cfg.welcomeBonus;
    return lang === 'ru'
      ? `👥 <b>Пригласите друга</b>\nКогда друг сделает первую покупку, вы получите <b>${money(a, lang)}</b>, а он — <b>${money(b, lang)}</b>.\n\nВаша ссылка:\n${link}\n\nПриглашено: ${u.refCount || 0}`
      : `👥 <b>Do‘stingizni taklif qiling</b>\nDo‘stingiz birinchi xaridini qilganda siz <b>${money(a, lang)}</b>, u esa <b>${money(b, lang)}</b> oladi.\n\nHavolangiz:\n${link}\n\nTaklif qilinganlar: ${u.refCount || 0}`;
  },
  shareBtn: (lang: BotLang) => (lang === 'ru' ? '📤 Поделиться' : '📤 Ulashish'),
  shareText: (lang: BotLang, bizName: string) => (lang === 'ru' ? `Заходи в ${bizName} — получай кэшбэк и бонусы! 🎁` : `${bizName} ga kel — cashback va bonuslar olasan! 🎁`),
  referrerNotice: (lang: BotLang, name: string, bonus: number) => (lang === 'ru' ? `🎉 Ваш друг <b>${esc(name)}</b> сделал первую покупку!\nВам начислено: <b>+${money(bonus, lang)}</b>` : `🎉 Do‘stingiz <b>${esc(name)}</b> birinchi xaridini qildi!\nSizga qo‘shildi: <b>+${money(bonus, lang)}</b>`),

  promosEmpty: (lang: BotLang) => (lang === 'ru' ? '🎁 Сейчас активных акций нет. Скоро будут!' : '🎁 Hozircha faol aksiyalar yo‘q. Tez orada bo‘ladi!'),
  promosHead: (lang: BotLang) => (lang === 'ru' ? '🎁 <b>Актуальные акции</b>' : '🎁 <b>Joriy aksiyalar</b>'),

  birthdayAsk: (lang: BotLang, bonus: number) => (lang === 'ru' ? `🎂 Напишите дату рождения в формате <b>ДД.ММ</b> (например 25.03).${bonus > 0 ? `\nВ ваш день рождения мы подарим <b>${money(bonus, lang)}</b>!` : ''}` : `🎂 Tug‘ilgan kuningizni <b>KK.OO</b> ko‘rinishida yozing (masalan 25.03).${bonus > 0 ? `\nTug‘ilgan kuningizda sizga <b>${money(bonus, lang)}</b> sovg‘a qilamiz!` : ''}`),
  birthdayBad: (lang: BotLang) => (lang === 'ru' ? '⚠️ Неверный формат. Пример: 25.03' : '⚠️ Format noto‘g‘ri. Masalan: 25.03'),
  birthdaySaved: (lang: BotLang, date: string) => (lang === 'ru' ? `✅ Сохранено: ${date}. Ждите подарок! 🎁` : `✅ Saqlandi: ${date}. Sovg‘ani kuting! 🎁`),
  birthdayHave: (lang: BotLang, date: string) => (lang === 'ru' ? `🎂 Ваша дата рождения уже сохранена: ${date}` : `🎂 Tug‘ilgan kuningiz saqlangan: ${date}`),
  birthdayGift: (lang: BotLang, bonus: number) => (lang === 'ru' ? `🎂🎉 <b>С днём рождения!</b>\nМы дарим вам <b>${money(bonus, lang)}</b> на баланс. Ждём вас в гости!` : `🎂🎉 <b>Tug‘ilgan kuningiz bilan!</b>\nBalansingizga <b>${money(bonus, lang)}</b> sovg‘a qildik. Mehmon bo‘ling!`),

  about(lang: BotLang, biz: { name: string; phone?: string; address?: string }, cfg: LoyaltyConfig): string {
    const parts = [`🏢 <b>${esc(biz.name)}</b>`];
    if (biz.address) parts.push(`📍 ${esc(biz.address)}`);
    if (biz.phone) parts.push(`📞 ${esc(biz.phone)}`);
    if (cfg.aboutExtra) parts.push('', cfg.aboutExtra);
    return parts.join('\n');
  },
  langAsk: () => '🌐 Tilni tanlang / Выберите язык',
  langSet: (lang: BotLang) => (lang === 'ru' ? '✅ Язык: Русский' : '✅ Til: O‘zbekcha'),
  blocked: (lang: BotLang) => (lang === 'ru' ? '⛔ Ваш аккаунт заблокирован.' : '⛔ Hisobingiz bloklangan.'),
  unknown: (lang: BotLang) => (lang === 'ru' ? 'Выберите действие в меню ниже 👇' : 'Quyidagi menyudan tanlang 👇'),

  ratingAsk: (lang: BotLang) => (lang === 'ru' ? '⭐ Как вам сегодняшнее обслуживание? Оцените, пожалуйста:' : '⭐ Bugungi xizmatni qanday baholaysiz? Baho bering:'),
  ratingThanks: (lang: BotLang, n: number) => (lang === 'ru' ? (n >= 4 ? `Спасибо за оценку ${n}⭐! Рады, что вам понравилось 💛` : `Спасибо за оценку ${n}⭐. Мы обязательно станем лучше.`) : (n >= 4 ? `${n}⭐ baho uchun rahmat! Yoqqaniga xursandmiz 💛` : `${n}⭐ baho uchun rahmat. Yaxshiroq bo‘lishga harakat qilamiz.`)),

  expireWarn: (lang: BotLang, amount: number, days: number) => (lang === 'ru' ? `⏳ Ваш кэшбэк <b>${money(amount, lang)}</b> сгорит через ${days} дн. Зайдите к нам и используйте его! 💛` : `⏳ <b>${money(amount, lang)}</b> cashbackingiz ${days} kundan keyin kuyadi. Kelib ishlatib qoling! 💛`),
  expired: (lang: BotLang, amount: number) => (lang === 'ru' ? `⌛ Кэшбэк <b>${money(amount, lang)}</b> сгорел из-за долгого отсутствия. Сканируйте новые чеки — копите снова!` : `⌛ <b>${money(amount, lang)}</b> cashback uzoq kelmaganingiz sabab kuydi. Yangi cheklarni skanerlab, qaytadan to‘plang!`),
  winback: (lang: BotLang, name: string, balance: number) => (lang === 'ru' ? `👋 ${esc(name)}, мы по вам скучаем!${balance > 0 ? `\nНа вашем балансе <b>${money(balance, lang)}</b> — самое время зайти 🎤` : '\nЗаходите — вас ждёт кэшбэк и сюрпризы 🎤'}` : `👋 ${esc(name)}, sizni sog‘indik!${balance > 0 ? `\nBalansingizda <b>${money(balance, lang)}</b> bor — kelib ishlating 🎤` : '\nKeling — cashback va sovg‘alar kutmoqda 🎤'}`),
};
