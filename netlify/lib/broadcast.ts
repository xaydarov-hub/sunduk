// Ommaviy xabar yuborish (matn / rasm / video + tugma). Telegram limiti: soniyasiga ~30 ta — biz 20 tadan yuboramiz.
import { Firestore } from 'firebase-admin/firestore';
import { db } from './admin';
import { esc, sendRich, sleep, adminIds } from './tg';
import { loadConfig } from './bot';
import { BroadcastAudience, BroadcastDoc, COL, LoyaltyUser, formatMoney } from '../../src/lib/loyalty/shared';

export async function audienceUsers(firestore: Firestore, audience: BroadcastAudience): Promise<LoyaltyUser[]> {
  let query: FirebaseFirestore.Query = firestore.collection(COL.users);
  if (audience.type === 'tier') query = query.where('tier', '==', audience.tier);
  const snap = await query.get();
  const now = Date.now();
  return snap.docs
    .map(doc => doc.data() as LoyaltyUser)
    .filter(u => !u.blocked && !u.botBlocked)
    .filter(u => {
      switch (audience.type) {
        case 'withBalance': return (u.balance || 0) > 0;
        case 'noPurchase': return (u.claims || 0) === 0;
        case 'inactive': return (u.claims || 0) > 0 && !!u.lastClaimAt && Date.parse(u.lastClaimAt) < now - audience.days * 86400 * 1000;
        default: return true;
      }
    });
}

/** {ism} va {balans} o'rniga mijozning ma'lumotini qo'yadi. */
export function personalize(text: string, user: Pick<LoyaltyUser, 'name' | 'balance'>): string {
  const first = (user.name || '').split(' ')[0] || user.name || '';
  return text.replace(/\{ism\}|\{name\}/g, esc(first)).replace(/\{balans\}|\{balance\}/g, formatMoney(user.balance || 0));
}

type Item = Pick<BroadcastDoc, 'text' | 'mediaType' | 'mediaFileId' | 'mediaUrl' | 'buttonText' | 'buttonUrl'>;

async function sendOne(item: Item, user: Pick<LoyaltyUser, 'tgId' | 'name' | 'balance'>): Promise<'sent' | 'blocked' | 'failed'> {
  const payload = { ...item, text: personalize(item.text || '', user) };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await sendRich(user.tgId, payload);
    if (res.ok) return 'sent';
    if (res.error_code === 429 && attempt === 0) { await sleep(((res.parameters?.retry_after ?? 2) + 1) * 1000); continue; }
    if (res.error_code === 403 || res.error_code === 400 && /chat not found|deactivated/i.test(res.description || '')) return 'blocked';
    return 'failed';
  }
  return 'failed';
}

export async function runBroadcast(id: string): Promise<void> {
  const firestore = db();
  const ref = firestore.collection(COL.broadcasts).doc(id);
  const started = await firestore.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data() as BroadcastDoc | undefined;
    if (!snap.exists || !data || data.status !== 'draft') return null;
    tx.update(ref, { status: 'sending', startedAt: new Date().toISOString(), sent: 0, failed: 0, blocked: 0 });
    return data;
  });
  if (!started) return;

  const deadline = Date.now() + (Number(process.env.BROADCAST_MAX_MS) || 13 * 60 * 1000);
  let sent = 0; let failed = 0; let blocked = 0;
  try {
    const users = await audienceUsers(firestore, started.audience);
    await ref.update({ total: users.length });
    const batchSize = Number(process.env.BROADCAST_BATCH) || 20;
    const pause = process.env.BROADCAST_PAUSE_MS !== undefined ? Number(process.env.BROADCAST_PAUSE_MS) : 1100;
    let chunkNo = 0;
    for (let i = 0; i < users.length; i += batchSize) {
      if (Date.now() > deadline) { await ref.update({ status: 'failed', error: 'Vaqt chegarasi tugadi — qolganlariga yuborilmadi', sent, failed, blocked, finishedAt: new Date().toISOString() }); return; }
      const chunk = users.slice(i, i + batchSize);
      const results = await Promise.all(chunk.map(user => sendOne(started, user)));
      const blockedIds: string[] = [];
      results.forEach((result, index) => {
        if (result === 'sent') sent += 1;
        else if (result === 'blocked') { blocked += 1; blockedIds.push(chunk[index].id); }
        else failed += 1;
      });
      if (blockedIds.length) await Promise.all(blockedIds.map(uid => firestore.collection(COL.users).doc(uid).set({ botBlocked: true }, { merge: true })));
      chunkNo += 1;
      if (chunkNo % 3 === 0) await ref.update({ sent, failed, blocked });
      if (pause > 0) await sleep(pause);
    }
    await ref.update({ status: 'done', sent, failed, blocked, finishedAt: new Date().toISOString() });
    const cfg = await loadConfig();
    for (const adminId of adminIds(cfg.adminChatIds)) {
      await sendRich(adminId, { text: `✅ <b>Xabar yuborildi</b>\nYuborildi: ${sent}\nYetmadi (bloklagan): ${blocked}\nXato: ${failed}` });
    }
  } catch (error) {
    await ref.update({ status: 'failed', error: error instanceof Error ? error.message.slice(0, 300) : 'Noma’lum xato', sent, failed, blocked, finishedAt: new Date().toISOString() }).catch(() => undefined);
  }
}

/** Sinov: xabarni faqat adminlarga yuboradi. */
export async function testBroadcast(item: Item): Promise<Array<{ to: string; ok: boolean; error?: string }>> {
  const cfg = await loadConfig();
  const out: Array<{ to: string; ok: boolean; error?: string }> = [];
  for (const adminId of adminIds(cfg.adminChatIds)) {
    const res = await sendRich(adminId, { ...item, text: personalize(item.text || '', { name: 'Ism Familiya', balance: 12500 }) });
    out.push({ to: adminId, ok: res.ok, error: res.ok ? undefined : res.description });
  }
  return out;
}
