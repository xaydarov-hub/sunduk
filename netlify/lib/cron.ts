// Kunlik avtomatik vazifalar (har kuni 10:00, Toshkent): hisobot, tug'ilgan kun, muddat, "sog'indik", tozalash.
import { db } from './admin';
import { adminIds, send, sleep } from './tg';
import { formatSummary, loadConfig, summary } from './bot';
import { T } from './texts';
import { creditBonus, expireBalance, patchUser } from './ledger';
import { COL, LoyaltyUser, tashkentDayStart, tashkentParts } from '../../src/lib/loyalty/shared';

const DAY = 86400 * 1000;

export async function runDaily(now = Date.now(), budgetMs = 25_000): Promise<Record<string, number>> {
  const firestore = db();
  const cfg = await loadConfig();
  const deadline = Date.now() + budgetMs;
  const out: Record<string, number> = { summary: 0, birthdays: 0, warned: 0, expired: 0, winback: 0, cleaned: 0 };
  const pace = Number(process.env.CRON_PACE_MS ?? 60);
  const safe = async (name: string, job: () => Promise<void>) => {
    try { if (Date.now() < deadline) await job(); } catch (error) { console.error(`[cron:${name}]`, error instanceof Error ? error.message : error); }
  };
  if (!cfg.enabled) return out;

  // 1) Egaga kechagi hisobot
  await safe('summary', async () => {
    if (!cfg.dailySummary) return;
    const today = tashkentDayStart(tashkentParts(now).ymd);
    const text = formatSummary('Kecha', await summary(firestore, today - DAY, today));
    for (const id of adminIds(cfg.adminChatIds)) { await send(id, text); out.summary += 1; }
  });

  // 2) Tug'ilgan kun
  await safe('birthday', async () => {
    if (!(cfg.birthdayBonus > 0)) return;
    const { md, year } = tashkentParts(now);
    const snap = await firestore.collection(COL.users).where('birthday', '==', md).get();
    for (const doc of snap.docs) {
      const user = doc.data() as LoyaltyUser;
      if (user.blocked || user.botBlocked || user.lastBirthdayYear === year || Date.now() > deadline) continue;
      await creditBonus(firestore, user.id, cfg.birthdayBonus, 'birthday', 'Tug‘ilgan kun sovg‘asi', { lastBirthdayYear: year });
      await send(user.tgId, T.birthdayGift(user.lang, cfg.birthdayBonus));
      out.birthdays += 1;
      if (pace) await sleep(pace);
    }
  });

  // 3) Muddat: ogohlantirish va kuydirish
  await safe('expiry', async () => {
    if (!(cfg.expiryDays > 0)) return;
    const warnFrom = new Date(now - (cfg.expiryDays - cfg.expiryWarnDays) * DAY).toISOString();
    const expireFrom = now - cfg.expiryDays * DAY;
    const snap = await firestore.collection(COL.users).where('lastActivityAt', '<', warnFrom).get();
    for (const doc of snap.docs) {
      const user = doc.data() as LoyaltyUser;
      if (!(user.balance > 0) || user.blocked || Date.now() > deadline) continue;
      if (Date.parse(user.lastActivityAt || '') < expireFrom) {
        const burned = await expireBalance(firestore, user.id);
        if (burned > 0 && !user.botBlocked) await send(user.tgId, T.expired(user.lang, burned));
        out.expired += 1;
      } else if (!user.expiryWarnedAt && !user.botBlocked) {
        const left = Math.max(1, Math.ceil((Date.parse(user.lastActivityAt || '') + cfg.expiryDays * DAY - now) / DAY));
        await send(user.tgId, T.expireWarn(user.lang, user.balance, left));
        await patchUser(user.id, { expiryWarnedAt: new Date(now).toISOString() });
        out.warned += 1;
      }
      if (pace) await sleep(pace);
    }
  });

  // 4) "Sog'indik"
  await safe('winback', async () => {
    if (!(cfg.winbackDays > 0)) return;
    const cutoff = new Date(now - cfg.winbackDays * DAY).toISOString();
    const snap = await firestore.collection(COL.users).where('lastClaimAt', '<', cutoff).get();
    let sent = 0;
    for (const doc of snap.docs) {
      const user = doc.data() as LoyaltyUser;
      if (user.blocked || user.botBlocked || Date.now() > deadline || sent >= 150) continue;
      if (user.lastWinbackAt && user.lastWinbackAt >= cutoff) continue;
      const res = await send(user.tgId, T.winback(user.lang, user.name.split(' ')[0] || user.name, user.balance || 0));
      await patchUser(user.id, res.error_code === 403 ? { botBlocked: true } : { lastWinbackAt: new Date(now).toISOString() });
      if (res.ok) { out.winback += 1; sent += 1; }
      if (pace) await sleep(pace);
    }
  });

  // 5) Eski "qayta yuborilgan yangilanish" belgilarini tozalash
  await safe('cleanup', async () => {
    const old = new Date(now - 2 * DAY).toISOString();
    for (let round = 0; round < 5 && Date.now() < deadline; round++) {
      const snap = await firestore.collection('loyaltyUpdates').where('at', '<', old).limit(400).get();
      if (snap.empty) break;
      const batch = firestore.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      out.cleaned += snap.size;
    }
  });

  return out;
}
