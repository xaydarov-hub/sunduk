// Cashback hisobi bilan barcha pul amallari — hammasi Firestore TRANZAKSIYASI bilan (ikki marta yozilib ketmaydi).
import { Firestore, Transaction } from 'firebase-admin/firestore';
import { db as getDb } from './admin';
import {
  BotLang, COL, ClaimDoc, LoyaltyConfig, LoyaltyTxType, LoyaltyUser, calcCashback, cashbackPercent, maxRedeemable, tierForSpent,
} from '../../src/lib/loyalty/shared';

export class LoyaltyError extends Error {
  constructor(public code: string, message?: string) { super(message || code); }
}

const nowIso = () => new Date().toISOString();

function addTx(db: Firestore, tx: Transaction, entry: { userId: string; type: LoyaltyTxType; amount: number; balanceAfter: number; receiptNumber?: string; note?: string }) {
  tx.set(db.collection(COL.tx).doc(), { ...entry, createdAt: nowIso() });
}

// ---------------------------------------------------------------
// Foydalanuvchi
// ---------------------------------------------------------------
export interface TgFrom { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string }

export async function ensureUser(db: Firestore, from: TgFrom, refBy?: string): Promise<{ user: LoyaltyUser; isNew: boolean }> {
  const ref = db.collection(COL.users).doc(String(from.id));
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || from.username || String(from.id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const now = nowIso();
    if (snap.exists) {
      const patch = { name, username: from.username || '', lastSeenAt: now, botBlocked: false };
      tx.update(ref, patch);
      return { user: { ...(snap.data() as LoyaltyUser), ...patch }, isNew: false };
    }
    const user: LoyaltyUser = {
      id: String(from.id), tgId: from.id, name, username: from.username || '',
      lang: from.language_code?.toLowerCase().startsWith('ru') ? 'ru' : 'uz',
      balance: 0, totalSpent: 0, totalEarned: 0, totalRedeemed: 0, claims: 0, spinTickets: 0, tier: 'bronze', refCount: 0,
      state: '', createdAt: now, lastSeenAt: now,
      ...(refBy && refBy !== String(from.id) ? { refBy } : {}),
    };
    tx.set(ref, user);
    return { user, isNew: true };
  });
}

export async function patchUser(userId: string, patch: Record<string, unknown>): Promise<void> {
  await getDb().collection(COL.users).doc(userId).set(patch, { merge: true });
}

export async function getUser(db: Firestore, userId: string): Promise<LoyaltyUser | null> {
  const snap = await db.collection(COL.users).doc(userId).get();
  return snap.exists ? (snap.data() as LoyaltyUser) : null;
}

/** Telefon raqam boshqa hisobga biriktirilganmi (bir odam — bir hisob). */
export async function phoneTakenBy(db: Firestore, phone: string, exceptUserId: string): Promise<boolean> {
  const snap = await db.collection(COL.users).where('phone', '==', phone).limit(2).get();
  return snap.docs.some(doc => doc.id !== exceptUserId);
}

// ---------------------------------------------------------------
// Chekni skanerlash → cashback
// ---------------------------------------------------------------
export interface ClaimOutcome {
  receiptNumber: string;
  amount: number;
  percent: number;
  basePercent: number;
  boosted: boolean;
  cashback: number;
  welcome: number;
  inviteeBonus: number;
  balance: number;
  tierBefore: string;
  tierAfter: string;
  spinTickets: number;
  code: string;
  referrer?: { id: string; bonus: number; lang: BotLang; name: string };
}

export async function claimReceipt(db: Firestore, cfg: LoyaltyConfig, userId: string, code: string): Promise<ClaimOutcome> {
  const userRef = db.collection(COL.users).doc(userId);
  const claimRef = db.collection(COL.claims).doc(code);
  return db.runTransaction(async tx => {
    const [userSnap, claimSnap] = await Promise.all([tx.get(userRef), tx.get(claimRef)]);
    if (!userSnap.exists) throw new LoyaltyError('NO_USER');
    const user = userSnap.data() as LoyaltyUser;
    if (user.blocked) throw new LoyaltyError('BLOCKED');
    if (!claimSnap.exists) throw new LoyaltyError('NOT_FOUND');
    const claim = claimSnap.data() as ClaimDoc;
    if (claim.status === 'claimed') throw new LoyaltyError(claim.claimedBy === userId ? 'USED_BY_YOU' : 'USED');
    const createdMs = Date.parse(claim.createdAt);
    const age = Date.now() - createdMs;
    if (!Number.isFinite(createdMs) || age > cfg.claimWindowHours * 3600 * 1000) throw new LoyaltyError('EXPIRED');
    if (!(claim.amount > 0) || !claim.paymentIds?.length) throw new LoyaltyError('INVALID');

    // Chek haqiqatan to'langanini to'lov yozuvlaridan tekshiramiz (claim hujjatiga ko'r-ko'rona ishonmaymiz)
    const paySnaps = await Promise.all(claim.paymentIds.map(id => tx.get(db.collection('payments').doc(id))));
    let verified = 0;
    for (const snap of paySnaps) {
      const pay = snap.data();
      if (!snap.exists || !pay || pay.receiptNumber !== claim.receiptNumber || pay.status === 'cancelled' || pay.method === 'bonus') throw new LoyaltyError('INVALID');
      verified += Number(pay.amount) || 0;
    }
    if (verified < claim.amount) throw new LoyaltyError('INVALID');

    const first = (user.claims || 0) === 0;
    let referrerSnap = null;
    if (first && user.refBy && user.refBy !== userId) referrerSnap = await tx.get(db.collection(COL.users).doc(user.refBy));

    const rate = cashbackPercent(cfg, user.totalSpent || 0, createdMs);
    const cashback = calcCashback(claim.amount, rate.percent);
    const welcome = first ? cfg.welcomeBonus : 0;
    const inviteeBonus = first && user.refBy && referrerSnap?.exists ? cfg.referralInviteeBonus : 0;
    const gain = cashback + welcome + inviteeBonus;
    const now = nowIso();
    const spentAfter = (user.totalSpent || 0) + claim.amount;
    const tierBefore = tierForSpent(cfg, user.totalSpent || 0).key;
    const tierAfter = tierForSpent(cfg, spentAfter).key;
    const balance = (user.balance || 0) + gain;
    const spinTickets = (user.spinTickets || 0) + cfg.spinsPerReceipt;

    tx.update(userRef, {
      balance, totalSpent: spentAfter, totalEarned: (user.totalEarned || 0) + gain, claims: (user.claims || 0) + 1,
      spinTickets, tier: tierAfter, lastActivityAt: now, lastClaimAt: now, pendingCode: '', expiryWarnedAt: '',
    });
    tx.update(claimRef, { status: 'claimed', claimedBy: userId, claimedAt: now, cashback, percent: rate.percent });
    addTx(db, tx, { userId, type: 'earn', amount: cashback, balanceAfter: (user.balance || 0) + cashback, receiptNumber: claim.receiptNumber, note: `${rate.percent}%${rate.boosted ? ' (aksiya)' : ''}` });
    if (welcome) addTx(db, tx, { userId, type: 'welcome', amount: welcome, balanceAfter: (user.balance || 0) + cashback + welcome, note: 'Xush kelibsiz bonusi' });
    if (inviteeBonus) addTx(db, tx, { userId, type: 'referral', amount: inviteeBonus, balanceAfter: balance, note: 'Taklif bonusi' });

    let referrer: ClaimOutcome['referrer'];
    if (referrerSnap?.exists && inviteeBonus > 0) {
      const ref = referrerSnap.data() as LoyaltyUser;
      if (!ref.blocked && cfg.referralInviterBonus > 0) {
        const refBalance = (ref.balance || 0) + cfg.referralInviterBonus;
        tx.update(referrerSnap.ref, { balance: refBalance, totalEarned: (ref.totalEarned || 0) + cfg.referralInviterBonus, refCount: (ref.refCount || 0) + 1 });
        addTx(db, tx, { userId: ref.id, type: 'referral', amount: cfg.referralInviterBonus, balanceAfter: refBalance, note: `${user.name} taklifi` });
        referrer = { id: ref.id, bonus: cfg.referralInviterBonus, lang: ref.lang, name: user.name };
      }
    }
    return {
      receiptNumber: claim.receiptNumber, amount: claim.amount, percent: rate.percent, basePercent: rate.base, boosted: rate.boosted,
      cashback, welcome, inviteeBonus, balance, tierBefore, tierAfter, spinTickets, code, referrer,
    };
  });
}

// ---------------------------------------------------------------
// Omad o'yini
// ---------------------------------------------------------------
/** Urinishni oldindan band qiladi (zar tashlanishidan oldin). */
export async function reserveSpin(db: Firestore, userId: string): Promise<boolean> {
  const ref = db.collection(COL.users).doc(userId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const user = snap.data() as LoyaltyUser | undefined;
    if (!user || user.blocked || (user.spinTickets || 0) < 1) return false;
    tx.update(ref, { spinTickets: user.spinTickets - 1 });
    return true;
  });
}

export async function refundSpin(db: Firestore, userId: string): Promise<void> {
  const ref = db.collection(COL.users).doc(userId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) tx.update(ref, { spinTickets: ((snap.data() as LoyaltyUser).spinTickets || 0) + 1 });
  });
}

export async function creditSpin(db: Firestore, userId: string, prize: number, dice: number): Promise<number> {
  const ref = db.collection(COL.users).doc(userId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const user = snap.data() as LoyaltyUser;
    const balance = (user.balance || 0) + prize;
    if (prize > 0) {
      tx.update(ref, { balance, totalEarned: (user.totalEarned || 0) + prize });
      addTx(db, tx, { userId, type: 'spin', amount: prize, balanceAfter: balance, note: `🎲 ${dice}` });
    }
    return balance;
  });
}

// ---------------------------------------------------------------
// Cashbackni kassada ishlatish (6 xonali kod)
// ---------------------------------------------------------------
const CODE_TTL_MS = 10 * 60 * 1000;

export async function createRedeemCode(db: Firestore, userId: string): Promise<{ code: string; expiresAt: string }> {
  // eski ochiq kodlarni bekor qilamiz
  const old = await db.collection(COL.redeemCodes).where('userId', '==', userId).where('status', '==', 'open').get();
  await Promise.all(old.docs.map(doc => doc.ref.update({ status: 'void' })));
  for (let attempt = 0; attempt < 8; attempt++) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    const code = String(buf[0] % 1_000_000).padStart(6, '0');
    const ref = db.collection(COL.redeemCodes).doc(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const ok = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const live = snap.exists && snap.data()?.status === 'open' && Date.parse(snap.data()?.expiresAt) > Date.now();
      if (live) return false;
      tx.set(ref, { userId, status: 'open', createdAt: nowIso(), expiresAt });
      return true;
    });
    if (ok) return { code, expiresAt };
  }
  throw new LoyaltyError('CODE_BUSY');
}

export interface RedeemLookup { code: string; userId: string; name: string; phone?: string; tier: string; balance: number; max: number; expiresAt: string }

async function readOpenCode(db: Firestore, tx: Transaction | null, code: string) {
  const ref = db.collection(COL.redeemCodes).doc(code);
  const snap = tx ? await tx.get(ref) : await ref.get();
  const data = snap.data();
  if (!snap.exists || !data) throw new LoyaltyError('CODE_INVALID');
  if (data.status !== 'open') throw new LoyaltyError(data.status === 'used' ? 'CODE_USED' : 'CODE_INVALID');
  if (Date.parse(data.expiresAt) < Date.now()) throw new LoyaltyError('CODE_EXPIRED');
  return { ref, userId: String(data.userId) };
}

export async function lookupRedeem(db: Firestore, cfg: LoyaltyConfig, code: string, due: number): Promise<RedeemLookup> {
  const { userId } = await readOpenCode(db, null, code);
  const user = await getUser(db, userId);
  if (!user || user.blocked) throw new LoyaltyError('CODE_INVALID');
  const codeSnap = await db.collection(COL.redeemCodes).doc(code).get();
  return { code, userId, name: user.name, phone: user.phone, tier: user.tier, balance: user.balance || 0, max: maxRedeemable(cfg, due, user.balance || 0), expiresAt: String(codeSnap.data()?.expiresAt) };
}

export async function redeemBalance(db: Firestore, cfg: LoyaltyConfig, params: { code: string; amount: number; due: number; staffId: string; staffName: string }): Promise<{ id: string; balance: number; userId: string; name: string }> {
  const amount = Math.round(params.amount);
  if (!(amount >= Math.max(1, cfg.minRedeemAmount))) throw new LoyaltyError('AMOUNT_LOW');
  return db.runTransaction(async tx => {
    const { ref: codeRef, userId } = await readOpenCode(db, tx, params.code);
    const userRef = db.collection(COL.users).doc(userId);
    const userSnap = await tx.get(userRef);
    const user = userSnap.data() as LoyaltyUser | undefined;
    if (!user || user.blocked) throw new LoyaltyError('CODE_INVALID');
    if (amount > (user.balance || 0)) throw new LoyaltyError('NO_FUNDS');
    if (amount > maxRedeemable(cfg, params.due, user.balance || 0)) throw new LoyaltyError('OVER_LIMIT');
    const balance = user.balance - amount;
    const id = db.collection(COL.redemptions).doc().id;
    tx.update(userRef, { balance, totalRedeemed: (user.totalRedeemed || 0) + amount, lastActivityAt: nowIso(), expiryWarnedAt: '' });
    tx.update(codeRef, { status: 'used', usedAt: nowIso(), redemptionId: id });
    tx.set(db.collection(COL.redemptions).doc(id), { id, userId, userName: user.name, amount, status: 'held', staffId: params.staffId, staffName: params.staffName, createdAt: nowIso() });
    addTx(db, tx, { userId, type: 'redeem', amount: -amount, balanceAfter: balance, note: 'Kassada ishlatildi' });
    return { id, balance, userId, name: user.name };
  });
}

export async function refundRedemption(db: Firestore, id: string): Promise<{ balance: number; userId: string; amount: number }> {
  const ref = db.collection(COL.redemptions).doc(id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const red = snap.data();
    if (!snap.exists || !red) throw new LoyaltyError('NOT_FOUND');
    if (red.status !== 'held') throw new LoyaltyError('NOT_HELD');
    const userRef = db.collection(COL.users).doc(red.userId);
    const userSnap = await tx.get(userRef);
    const user = userSnap.data() as LoyaltyUser;
    const balance = (user.balance || 0) + red.amount;
    tx.update(userRef, { balance, totalRedeemed: Math.max(0, (user.totalRedeemed || 0) - red.amount) });
    tx.update(ref, { status: 'refunded', refundedAt: nowIso() });
    addTx(db, tx, { userId: red.userId, type: 'refund', amount: red.amount, balanceAfter: balance, note: 'To‘lov bajarilmadi — qaytarildi' });
    return { balance, userId: red.userId, amount: red.amount };
  });
}

export async function confirmRedemption(db: Firestore, id: string, receiptNumber: string): Promise<void> {
  const ref = db.collection(COL.redemptions).doc(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.status === 'held') tx.update(ref, { status: 'applied', receiptNumber, appliedAt: nowIso() });
  });
}

// ---------------------------------------------------------------
// Admin / kron
// ---------------------------------------------------------------
export async function adjustBalance(db: Firestore, userId: string, amount: number, note: string): Promise<number> {
  const ref = db.collection(COL.users).doc(userId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const user = snap.data() as LoyaltyUser | undefined;
    if (!user) throw new LoyaltyError('NOT_FOUND');
    const balance = (user.balance || 0) + Math.round(amount);
    if (balance < 0) throw new LoyaltyError('NO_FUNDS');
    tx.update(ref, { balance, ...(amount > 0 ? { totalEarned: (user.totalEarned || 0) + Math.round(amount) } : {}) });
    addTx(db, tx, { userId, type: 'admin', amount: Math.round(amount), balanceAfter: balance, note: note || 'Admin tuzatishi' });
    return balance;
  });
}

export async function expireBalance(db: Firestore, userId: string): Promise<number> {
  const ref = db.collection(COL.users).doc(userId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const user = snap.data() as LoyaltyUser | undefined;
    if (!user || !(user.balance > 0)) return 0;
    tx.update(ref, { balance: 0 });
    addTx(db, tx, { userId, type: 'expire', amount: -user.balance, balanceAfter: 0, note: 'Muddati o‘tdi' });
    return user.balance;
  });
}

export async function creditBonus(db: Firestore, userId: string, amount: number, type: 'birthday', note: string, extra: Record<string, unknown> = {}): Promise<number> {
  const ref = db.collection(COL.users).doc(userId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const user = snap.data() as LoyaltyUser;
    const balance = (user.balance || 0) + amount;
    tx.update(ref, { balance, totalEarned: (user.totalEarned || 0) + amount, ...extra });
    addTx(db, tx, { userId, type, amount, balanceAfter: balance, note });
    return balance;
  });
}

export async function recentTx(db: Firestore, userId: string, limit = 10) {
  // orderBy qo'shilsa kompozit indeks kerak bo'ladi — mijozning yozuvlari kam, shuning uchun xotirada saralaymiz
  const snap = await db.collection(COL.tx).where('userId', '==', userId).limit(400).get();
  return snap.docs.map(doc => doc.data()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}
