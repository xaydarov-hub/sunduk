// Telegram bot mantig'i: /start, chekni skanerlash, balans, omad o'yini, cashback kodi, taklif, aksiyalar va h.k.
import { AggregateField, Firestore } from 'firebase-admin/firestore';
import { db } from './admin';
import { esc, inline, send, sendRich, sleep, tg, adminIds } from './tg';
import { T, mainKeyboard, matchMenu, MenuKey } from './texts';
import {
  ClaimOutcome, LoyaltyError, claimReceipt, createRedeemCode, creditSpin, ensureUser, getUser, patchUser, phoneTakenBy, recentTx, refundSpin, reserveSpin,
} from './ledger';
import { AdDoc, BotLang, COL, ClaimDoc, LoyaltyConfig, LoyaltyUser, mergeConfig, tashkentDayStart, tashkentParts } from '../../src/lib/loyalty/shared';

// ---------------------------------------------------------------
// Sozlamalar
// ---------------------------------------------------------------
export async function loadConfig(): Promise<LoyaltyConfig> {
  const snap = await db().collection(COL.config).doc('config').get();
  return mergeConfig(snap.data() as Partial<LoyaltyConfig> | undefined);
}

async function bizInfo(): Promise<{ name: string; phone: string; address: string }> {
  const data = (await db().collection('settings').doc('main').get()).data() || {};
  return { name: String(data.businessName || 'SUNDuk'), phone: String(data.businessPhone || ''), address: String(data.businessAddress || '') };
}

/** Telegram bir xil yangilanishni qayta yuborishi mumkin (timeout) — ikki marta ishlamasligi uchun belgilab boramiz. */
export async function markUpdate(updateId: number): Promise<boolean> {
  try {
    await db().collection('loyaltyUpdates').doc(String(updateId)).create({ at: new Date().toISOString() });
    return true;
  } catch (error) {
    const code = (error as { code?: number | string }).code;
    if (code === 6 || code === 'already-exists') return false;
    throw error;
  }
}

// ---------------------------------------------------------------
// Kirish nuqtasi
// ---------------------------------------------------------------
export async function handleUpdate(update: any): Promise<void> {
  const cfg = await loadConfig();
  if (update.my_chat_member) return onMyChatMember(update.my_chat_member);
  if (update.message) return onMessage(cfg, update.message);
  if (update.callback_query) return onCallback(cfg, update.callback_query);
}

async function onMyChatMember(event: any): Promise<void> {
  if (event.chat?.type !== 'private') return;
  const status = event.new_chat_member?.status;
  if (status === 'kicked' || status === 'left') await patchUser(String(event.from.id), { botBlocked: true }).catch(() => undefined);
}

// ---------------------------------------------------------------
// Majburiy kanallar
// ---------------------------------------------------------------
async function missingChannels(cfg: LoyaltyConfig, userId: number): Promise<string[]> {
  const missing: string[] = [];
  for (const raw of cfg.channels) {
    const channel = raw.trim();
    if (!channel) continue;
    const res = await tg('getChatMember', { chat_id: channel.startsWith('@') || /^-?\d+$/.test(channel) ? channel : `@${channel}`, user_id: userId });
    if (!res.ok) continue; // bot kanalda admin emas / kanal topilmadi — foydalanuvchini qamab qo'ymaymiz (admin panelda ogohlantirish chiqadi)
    const status = res.result?.status;
    if (!['member', 'administrator', 'creator'].includes(status)) missing.push(channel);
  }
  return missing;
}

async function sendGate(lang: BotLang, chatId: number, missing: string[]): Promise<void> {
  const rows = missing.map(c => [{ text: T.gateOpen(lang, c), url: `https://t.me/${c.replace(/^@/, '')}` }]);
  rows.push([{ text: T.gateCheck(lang), callback_data: 'chk' } as any]);
  await send(chatId, T.gate(lang, missing), inline(rows as any));
}

// ---------------------------------------------------------------
// Xabarlar
// ---------------------------------------------------------------
const COMMANDS: Record<string, MenuKey> = { '/balance': 'balance', '/spin': 'spin', '/redeem': 'redeem', '/invite': 'invite', '/history': 'history', '/promos': 'promos', '/about': 'about', '/lang': 'lang' };

async function onMessage(cfg: LoyaltyConfig, msg: any): Promise<void> {
  if (msg.chat?.type !== 'private' || !msg.from || msg.from.is_bot) return;
  const from = msg.from;
  const chatId: number = msg.chat.id;
  const id = String(from.id);
  const isAdmin = adminIds(cfg.adminChatIds).includes(id);
  const text: string = typeof msg.text === 'string' ? msg.text.trim() : '';

  if (isAdmin && (msg.photo || msg.video || msg.animation)) { await saveMedia(chatId, msg); return; }

  let payload = '';
  const isStart = text === '/start' || text.startsWith('/start ');
  if (isStart) payload = text.slice(6).trim();
  const refBy = payload.startsWith('ref_') ? payload.slice(4).replace(/\D/g, '') : undefined;
  const { user } = await ensureUser(db(), from, refBy);
  const lang = user.lang;

  if (user.blocked) { await send(chatId, T.blocked(lang)); return; }
  if (!cfg.enabled && !isAdmin) { await send(chatId, lang === 'ru' ? '⏸ Программа лояльности пока не запущена.' : '⏸ Sodiqlik dasturi hozircha ishga tushmagan.'); return; }

  if (isAdmin && text.startsWith('/') && !isStart) { if (await adminCommand(cfg, chatId, text)) return; }

  // Majburiy obuna (admin uchun emas)
  if (!isAdmin && cfg.channels.length) {
    const missing = await missingChannels(cfg, from.id);
    if (missing.length) {
      const code = payload.startsWith('r_') ? payload.slice(2) : '';
      if (code) await patchUser(id, { pendingCode: code });
      await sendGate(lang, chatId, missing);
      return;
    }
  }

  if (msg.contact) { await onContact(cfg, user, chatId, msg.contact); return; }

  if (isStart) {
    if (payload.startsWith('r_')) { await tryClaim(cfg, user, payload.slice(2), chatId); return; }
    const biz = await bizInfo();
    await send(chatId, T.welcome(lang, user.name, cfg, biz.name), { reply_markup: mainKeyboard(lang) });
    return;
  }

  if (user.state === 'birthday' && text && !matchMenu(text) && !text.startsWith('/')) { await saveBirthday(cfg, user, chatId, text); return; }

  const key = matchMenu(text) ?? COMMANDS[text.split('@')[0]] ?? null;
  if (key) { if (user.state) await patchUser(user.id, { state: '' }); await runMenu(cfg, user, chatId, key); return; }

  // chekdagi kodni qo'lda yuborish
  const bare = text.replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z0-9]{12}$/.test(bare)) { await tryClaim(cfg, user, bare, chatId); return; }

  await send(chatId, T.unknown(lang), { reply_markup: mainKeyboard(lang) });
}

async function runMenu(cfg: LoyaltyConfig, user: LoyaltyUser, chatId: number, key: MenuKey): Promise<void> {
  const lang = user.lang;
  const fresh = (await getUser(db(), user.id)) ?? user;
  switch (key) {
    case 'balance':
      await send(chatId, T.balance(lang, fresh, cfg), { reply_markup: mainKeyboard(lang) });
      return;
    case 'scan':
      await send(chatId, T.scanHelp(lang), { reply_markup: mainKeyboard(lang) });
      return;
    case 'spin':
      if ((fresh.spinTickets || 0) < 1) await send(chatId, T.spinNone(lang, cfg.spinsPerReceipt), { reply_markup: mainKeyboard(lang) });
      else await send(chatId, T.spinIntro(lang, fresh.spinTickets), inline([[{ text: T.spinBtn(lang), callback_data: 'spin' }]]));
      return;
    case 'redeem': {
      if ((fresh.balance || 0) < Math.max(1, cfg.minRedeemAmount)) { await send(chatId, T.redeemEmpty(lang), { reply_markup: mainKeyboard(lang) }); return; }
      try {
        const { code } = await createRedeemCode(db(), user.id);
        await send(chatId, T.redeem(lang, code, fresh, cfg), { reply_markup: mainKeyboard(lang) });
      } catch { await send(chatId, T.claimErr(lang, 'ERR')); }
      return;
    }
    case 'invite': {
      const link = `https://t.me/${cfg.botUsername.replace(/^@/, '')}?start=ref_${user.id}`;
      const biz = await bizInfo();
      const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(T.shareText(lang, biz.name))}`;
      await send(chatId, T.invite(lang, link, cfg, fresh), inline([[{ text: T.shareBtn(lang), url: share }]]));
      return;
    }
    case 'history':
      await send(chatId, T.history(lang, (await recentTx(db(), user.id, 10)) as any), { reply_markup: mainKeyboard(lang) });
      return;
    case 'promos':
      await showPromos(cfg, chatId, lang);
      return;
    case 'birthday':
      if (fresh.birthday) await send(chatId, T.birthdayHave(lang, fresh.birthday.split('-').reverse().join('.')), { reply_markup: mainKeyboard(lang) });
      else { await patchUser(user.id, { state: 'birthday' }); await send(chatId, T.birthdayAsk(lang, cfg.birthdayBonus)); }
      return;
    case 'about':
      await send(chatId, T.about(lang, await bizInfo(), cfg), { reply_markup: mainKeyboard(lang), ...(cfg.mapUrl ? inline([[{ text: lang === 'ru' ? '📍 На карте' : '📍 Xaritada', url: cfg.mapUrl }]]) : {}) });
      return;
    case 'lang':
      await send(chatId, T.langAsk(), inline([[{ text: '🇺🇿 O‘zbekcha', callback_data: 'lang:uz' }, { text: '🇷🇺 Русский', callback_data: 'lang:ru' }]]));
      return;
  }
}

// ---------------------------------------------------------------
// Telefon
// ---------------------------------------------------------------
async function onContact(cfg: LoyaltyConfig, user: LoyaltyUser, chatId: number, contact: any): Promise<void> {
  const lang = user.lang;
  if (Number(contact.user_id) !== user.tgId) { await send(chatId, T.phoneNotOwn(lang)); return; }
  const digits = String(contact.phone_number || '').replace(/\D/g, '');
  if (digits.length < 9) { await send(chatId, T.phoneNotOwn(lang)); return; }
  const phone = `+${digits}`;
  if (await phoneTakenBy(db(), phone, user.id)) { await send(chatId, T.phoneTaken(lang), { reply_markup: mainKeyboard(lang) }); return; }
  await patchUser(user.id, { phone, state: '' });
  await send(chatId, T.phoneSaved(lang), { reply_markup: mainKeyboard(lang) });
  if (user.pendingCode) await tryClaim(cfg, { ...user, phone }, user.pendingCode, chatId);
}

// ---------------------------------------------------------------
// Chekni skanerlash
// ---------------------------------------------------------------
async function tryClaim(cfg: LoyaltyConfig, user: LoyaltyUser, code: string, chatId: number): Promise<void> {
  const lang = user.lang;
  if (cfg.requirePhone && !user.phone) {
    await patchUser(user.id, { pendingCode: code, state: 'phone' });
    await send(chatId, T.askPhone(lang), { reply_markup: { keyboard: [[{ text: T.sharePhoneBtn(lang), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
    return;
  }
  let outcome: ClaimOutcome;
  try {
    outcome = await claimReceipt(db(), cfg, user.id, code);
  } catch (error) {
    if (error instanceof LoyaltyError) await send(chatId, T.claimErr(lang, error.code), { reply_markup: mainKeyboard(lang) });
    else { console.error('[claim] xato', error instanceof Error ? error.message : error); await send(chatId, T.claimErr(lang, 'ERR'), { reply_markup: mainKeyboard(lang) }); }
    return;
  }
  const ad = await afterClaimAd(lang);
  const rows = outcome.spinTickets > 0 ? [[{ text: T.spinBtn(lang), callback_data: 'spin' }]] : [];
  await send(chatId, T.claimOk(lang, outcome, cfg, ad), { reply_markup: rows.length ? { inline_keyboard: rows } : mainKeyboard(lang) });
  if (rows.length) await send(chatId, '👇', { reply_markup: mainKeyboard(lang) });
  await send(chatId, T.ratingAsk(lang), inline([[1, 2, 3, 4, 5].map(n => ({ text: `${n}⭐`, callback_data: `rate:${code}:${n}` }))]));
  if (outcome.referrer) await send(outcome.referrer.id, T.referrerNotice(outcome.referrer.lang, outcome.referrer.name, outcome.referrer.bonus));
}

// ---------------------------------------------------------------
// Reklama / aksiyalar
// ---------------------------------------------------------------
async function activeAds(): Promise<AdDoc[]> {
  const snap = await db().collection(COL.ads).where('active', '==', true).get();
  const now = Date.now();
  return snap.docs
    .map(doc => ({ ...(doc.data() as AdDoc), id: doc.id }))
    .filter(ad => (!ad.startsAt || Date.parse(ad.startsAt) <= now) && (!ad.endsAt || Date.parse(ad.endsAt) >= now))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

const adBody = (ad: AdDoc) => `${ad.title ? `<b>${esc(ad.title)}</b>\n` : ''}${ad.text || ''}`.trim();

async function afterClaimAd(lang: BotLang): Promise<string | undefined> {
  try {
    const ad = (await activeAds()).find(a => a.showAfterClaim);
    if (!ad) return undefined;
    return `📢 ${adBody(ad)}${ad.buttonUrl ? `\n${ad.buttonUrl}` : ''}`.slice(0, 700);
  } catch { void lang; return undefined; }
}

async function showPromos(cfg: LoyaltyConfig, chatId: number, lang: BotLang): Promise<void> {
  void cfg;
  const ads = await activeAds();
  if (!ads.length) { await send(chatId, T.promosEmpty(lang), { reply_markup: mainKeyboard(lang) }); return; }
  await send(chatId, T.promosHead(lang));
  for (const ad of ads.slice(0, 6)) await sendRich(chatId, { text: adBody(ad), mediaType: ad.mediaType, mediaFileId: ad.mediaFileId, mediaUrl: ad.mediaUrl, buttonText: ad.buttonText, buttonUrl: ad.buttonUrl });
}

// ---------------------------------------------------------------
// Tug'ilgan kun
// ---------------------------------------------------------------
async function saveBirthday(cfg: LoyaltyConfig, user: LoyaltyUser, chatId: number, text: string): Promise<void> {
  const m = text.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
  const day = m ? Number(m[1]) : 0;
  const month = m ? Number(m[2]) : 0;
  const daysIn = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!m || month < 1 || month > 12 || day < 1 || day > daysIn[month - 1]) { await send(chatId, T.birthdayBad(user.lang)); return; }
  const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  await patchUser(user.id, { birthday: md, state: '' });
  void cfg;
  await send(chatId, T.birthdaySaved(user.lang, `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`), { reply_markup: mainKeyboard(user.lang) });
}

// ---------------------------------------------------------------
// Callback tugmalar
// ---------------------------------------------------------------
async function onCallback(cfg: LoyaltyConfig, cb: any): Promise<void> {
  const from = cb.from;
  const chatId: number | undefined = cb.message?.chat?.id;
  const data: string = cb.data || '';
  void tg('answerCallbackQuery', { callback_query_id: cb.id });
  if (!from || !chatId) return;
  const { user } = await ensureUser(db(), from);
  const lang = user.lang;
  if (user.blocked) return;
  const isAdmin = adminIds(cfg.adminChatIds).includes(String(from.id));

  if (data.startsWith('lang:')) {
    const next: BotLang = data.endsWith('ru') ? 'ru' : 'uz';
    await patchUser(user.id, { lang: next });
    await send(chatId, T.langSet(next), { reply_markup: mainKeyboard(next) });
    return;
  }

  if (!isAdmin && cfg.channels.length) {
    const missing = await missingChannels(cfg, from.id);
    if (missing.length) {
      if (data === 'chk') await send(chatId, T.gateFail(lang));
      await sendGate(lang, chatId, missing);
      return;
    }
  }

  if (data === 'chk') {
    if (user.pendingCode) await tryClaim(cfg, user, user.pendingCode, chatId);
    else await send(chatId, T.unknown(lang), { reply_markup: mainKeyboard(lang) });
    return;
  }
  if (data === 'spin') { await doSpin(cfg, user, chatId); return; }
  if (data.startsWith('rate:')) { await rate(cfg, user, chatId, cb.message?.message_id, data); return; }
}

async function doSpin(cfg: LoyaltyConfig, user: LoyaltyUser, chatId: number): Promise<void> {
  const lang = user.lang;
  if (!(await reserveSpin(db(), user.id))) { await send(chatId, T.spinNone(lang, cfg.spinsPerReceipt)); return; }
  const dice = await tg('sendDice', { chat_id: chatId, emoji: '🎲' });
  const value: number | undefined = dice.result?.dice?.value;
  if (!dice.ok || !value) { await refundSpin(db(), user.id); await send(chatId, T.claimErr(lang, 'ERR')); return; }
  await sleep(Number(process.env.SPIN_WAIT_MS ?? 3500)); // animatsiya tugashini kutamiz
  const prize = cfg.spinPrizes[value - 1] || 0;
  const balance = await creditSpin(db(), user.id, prize, value);
  const fresh = await getUser(db(), user.id);
  const tickets = fresh?.spinTickets ?? 0;
  await send(chatId, T.spinResult(lang, value, prize, balance, tickets), tickets > 0 ? inline([[{ text: T.spinBtn(lang), callback_data: 'spin' }]]) : {});
}

async function rate(cfg: LoyaltyConfig, user: LoyaltyUser, chatId: number, messageId: number | undefined, data: string): Promise<void> {
  const [, code, n] = data.split(':');
  const stars = Math.max(1, Math.min(5, Number(n) || 0));
  const ref = db().collection(COL.claims).doc(code);
  const outcome = await db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const claim = snap.data() as ClaimDoc | undefined;
    if (!claim || claim.claimedBy !== user.id || claim.rating) return null;
    tx.update(ref, { rating: stars, ratedAt: new Date().toISOString() });
    return claim;
  });
  if (messageId) await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: T.ratingThanks(user.lang, stars), parse_mode: 'HTML' });
  if (outcome && cfg.notifyLowRating && stars <= cfg.ratingThreshold) {
    const lines = [
      `⚠️ <b>Past baho: ${stars}⭐</b>`,
      `Chek: ${esc(outcome.receiptNumber)} · ${outcome.amount.toLocaleString('ru-RU')} so'm`,
      outcome.roomNumber ? `Xona: ${esc(outcome.roomNumber)}` : 'Bar savdosi',
      outcome.waiterName ? `Ofitsiant: ${esc(outcome.waiterName)}` : '',
      outcome.cashierName ? `Kassir: ${esc(outcome.cashierName)}` : '',
      `Mijoz: ${esc(user.name)}${user.username ? ` (@${esc(user.username)})` : ''}${user.phone ? ` · ${esc(user.phone)}` : ''}`,
    ].filter(Boolean);
    for (const adminId of adminIds(cfg.adminChatIds)) await send(adminId, lines.join('\n'));
  }
}

// ---------------------------------------------------------------
// Admin: media kutubxonasi va buyruqlar
// ---------------------------------------------------------------
async function saveMedia(chatId: number, msg: any): Promise<void> {
  let type: 'photo' | 'video';
  let fileId: string;
  if (msg.photo?.length) { type = 'photo'; fileId = msg.photo[msg.photo.length - 1].file_id; }
  else if (msg.video) { type = 'video'; fileId = msg.video.file_id; }
  else if (msg.animation) { type = 'video'; fileId = msg.animation.file_id; }
  else return;
  await db().collection(COL.media).add({ type, fileId, caption: msg.caption || '', createdAt: new Date().toISOString() });
  await send(chatId, `✅ ${type === 'photo' ? 'Rasm' : 'Video'} media kutubxonasiga saqlandi.\nAdmin panel → Sodiqlik → Xabar yuborish / Reklama bo‘limida uni tanlashingiz mumkin.`);
}

export interface Summary {
  claims: number; receiptsAmount: number; cashback: number; newUsers: number; totalUsers: number; totalBalance: number;
  spinPayout: number; redeemed: number; ratings: number; avgRating: number | null; lowRatings: number;
}

export async function summary(firestore: Firestore, fromMs: number, toMs: number): Promise<Summary> {
  const from = new Date(fromMs).toISOString();
  const to = new Date(toMs).toISOString();
  const [claims, users, txs, total, balance] = await Promise.all([
    firestore.collection(COL.claims).where('claimedAt', '>=', from).where('claimedAt', '<', to).get(),
    firestore.collection(COL.users).where('createdAt', '>=', from).where('createdAt', '<', to).get(),
    firestore.collection(COL.tx).where('createdAt', '>=', from).where('createdAt', '<', to).get(),
    firestore.collection(COL.users).count().get(),
    firestore.collection(COL.users).aggregate({ sum: AggregateField.sum('balance') }).get(),
  ]);
  let receiptsAmount = 0; let cashback = 0; let ratingSum = 0; let ratings = 0; let low = 0;
  claims.docs.forEach(doc => {
    const c = doc.data() as ClaimDoc;
    receiptsAmount += c.amount || 0; cashback += c.cashback || 0;
    if (c.rating) { ratings += 1; ratingSum += c.rating; if (c.rating <= 3) low += 1; }
  });
  let spinPayout = 0; let redeemed = 0;
  txs.docs.forEach(doc => { const t = doc.data(); if (t.type === 'spin') spinPayout += t.amount; if (t.type === 'redeem') redeemed += -t.amount; if (t.type === 'refund') redeemed -= t.amount; });
  return {
    claims: claims.size, receiptsAmount, cashback, newUsers: users.size, totalUsers: total.data().count, totalBalance: Number(balance.data().sum) || 0,
    spinPayout, redeemed, ratings, avgRating: ratings ? Math.round((ratingSum / ratings) * 10) / 10 : null, lowRatings: low,
  };
}

const som = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;

export function formatSummary(title: string, s: Summary): string {
  return [
    `📊 <b>${title}</b>`,
    `🧾 Skanerlangan cheklar: <b>${s.claims}</b> (${som(s.receiptsAmount)})`,
    `💸 Berilgan cashback: ${som(s.cashback)}`,
    `🎰 O‘yin sovg‘alari: ${som(s.spinPayout)}`,
    `💳 Ishlatilgan cashback: ${som(s.redeemed)}`,
    `👤 Yangi mijozlar: <b>${s.newUsers}</b> · Jami: ${s.totalUsers}`,
    `🏦 Mijozlar balansi (majburiyat): ${som(s.totalBalance)}`,
    s.ratings ? `⭐ Baho: ${s.avgRating} (${s.ratings} ta${s.lowRatings ? `, past: ${s.lowRatings}` : ''})` : '⭐ Baholar: yo‘q',
  ].join('\n');
}

async function adminCommand(cfg: LoyaltyConfig, chatId: number, text: string): Promise<boolean> {
  const cmd = text.split(/[\s@]/)[0];
  if (cmd === '/stat' || cmd === '/stats') {
    const now = Date.now();
    const start = tashkentDayStart(tashkentParts(now).ymd);
    await send(chatId, formatSummary('Bugun', await summary(db(), start, now + 1000)));
    return true;
  }
  if (cmd === '/admin' || cmd === '/help') {
    await send(chatId, '🛠 <b>Admin buyruqlari</b>\n/stat — bugungi statistika\nRasm yoki video yuborsangiz — media kutubxonasiga saqlanadi (xabar/reklama uchun).\n\nBoshqaruv: admin panel → Sodiqlik.');
    return true;
  }
  void cfg;
  return false;
}
