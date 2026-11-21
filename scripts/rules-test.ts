/* Firestore xavfsizlik qoidalarini (sodiqlik qismi) emulyatorda tekshiradi: kim nimani o'qiy/yoza olishi.
 *   npm run emulators   →   npx tsx scripts/rules-test.ts
 */
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-sunduk';
process.env.FB_PROJECT_ID = 'demo-sunduk';

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

let passed = 0; let failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => { if (cond) { passed += 1; console.log(`  ✓ ${name}`); } else { failed += 1; console.log(`  ✗ ${name}`, extra ?? ''); } };

async function allowed(fn: () => Promise<unknown>): Promise<boolean> { try { await fn(); return true; } catch { return false; } }

async function main() {
  const { db: adminDb, adminAuth } = await import('../netlify/lib/admin');
  const admin = adminDb();
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sunduk/databases/%28default%29/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-sunduk/accounts', { method: 'DELETE' });

  // tizim "sozlangan" bo'lsin
  await admin.collection('meta').doc('public').set({ initialized: true });
  const make = async (email: string, role: string) => {
    const rec = await adminAuth().createUser({ email, password: 'Secret123' });
    await admin.collection('users').doc(rec.uid).set({ id: rec.uid, name: email, role, isActive: true });
    return rec.uid;
  };
  const uids = { admin: await make('a@x.uz', 'admin'), bar: await make('b@x.uz', 'bar'), waiter: await make('w@x.uz', 'waiter') };
  await admin.collection('loyaltyUsers').doc('1').set({ id: '1', name: 'Mijoz', balance: 100 });
  await admin.collection('loyalty').doc('config').set({ enabled: true, botUsername: 'x_bot' });
  await admin.collection('claims').doc('EXISTING').set({ code: 'EXISTING', status: 'open', amount: 1000, paymentIds: ['p0'] });
  await admin.collection('redemptions').doc('r1').set({ id: 'r1', amount: 1 });
  await admin.collection('loyaltyMedia').doc('m1').set({ id: 'm1', type: 'photo', fileId: 'F' });

  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-sunduk', appId: '1:1:web:1' });
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const as = async (who: 'admin' | 'bar' | 'waiter') => { await signOut(auth); await signInWithEmailAndPassword(auth, { admin: 'a@x.uz', bar: 'b@x.uz', waiter: 'w@x.uz' }[who], 'Secret123'); };
  const now = new Date().toISOString();

  const payAndClaim = async (code: string, opts: { amount?: number; status?: string; skipPayment?: boolean; extraPaymentId?: string } = {}) => {
    const uid = auth.currentUser!.uid;
    const batch = writeBatch(db);
    const payId = `pay-${code}`;
    if (!opts.skipPayment) batch.set(doc(db, 'payments', payId), { id: payId, amount: 5000, method: 'cash', receiptNumber: `RCP-${code}`, processedBy: uid, status: 'confirmed', createdAt: now });
    batch.set(doc(db, 'claims', code), { code, receiptNumber: `RCP-${code}`, amount: opts.amount ?? 5000, paymentIds: [opts.extraPaymentId ?? payId], createdAt: now, status: opts.status ?? 'open' });
    await batch.commit();
  };

  console.log('\n[kassir — bar]');
  await as('bar');
  check('to‘lov + claim bir tranzaksiyada yaratadi', await allowed(() => payAndClaim('AAAA1111')));
  check('to‘lovsiz claim yarata olmaydi', !(await allowed(() => payAndClaim('BBBB2222', { skipPayment: true, extraPaymentId: 'yoq-pay' }))));
  check('amount = 0 bo‘lsa rad etiladi', !(await allowed(() => payAndClaim('CCCC3333', { amount: 0 }))));
  check('tayyor “claimed” holatda yarata olmaydi', !(await allowed(() => payAndClaim('DDDD4444', { status: 'claimed' }))));
  check('claim o‘qiy olmaydi', !(await allowed(() => getDoc(doc(db, 'claims', 'AAAA1111')))));
  check('claim o‘zgartira olmaydi', !(await allowed(() => updateDoc(doc(db, 'claims', 'AAAA1111'), { status: 'claimed', cashback: 999999 }))));
  check('sodiqlik sozlamasini o‘qiy oladi', await allowed(() => getDoc(doc(db, 'loyalty', 'config'))));
  check('sodiqlik sozlamasini yoza olmaydi', !(await allowed(() => setDoc(doc(db, 'loyalty', 'config'), { enabled: false }, { merge: true }))));
  check('mijozlar ro‘yxatini o‘qiy olmaydi', !(await allowed(() => getDoc(doc(db, 'loyaltyUsers', '1')))));
  check('mijoz balansini yoza olmaydi', !(await allowed(() => updateDoc(doc(db, 'loyaltyUsers', '1'), { balance: 9999999 }))));
  check('redemption o‘qiy olmaydi', !(await allowed(() => getDoc(doc(db, 'redemptions', 'r1')))));
  check('reklama o‘qiy olmaydi', !(await allowed(() => getDoc(doc(db, 'ads', 'x')))));
  check('ommaviy xabar yarata olmaydi', !(await allowed(() => setDoc(doc(db, 'broadcasts', 'b1'), { status: 'draft', text: 'x' }))));

  console.log('\n[ofitsiant — waiter]');
  await as('waiter');
  check('claim yarata olmaydi', !(await allowed(() => setDoc(doc(db, 'claims', 'WWWW0001'), { code: 'WWWW0001', status: 'open', amount: 5000, paymentIds: ['p'] }))));
  check('sodiqlik sozlamasini o‘qiy olmaydi', !(await allowed(() => getDoc(doc(db, 'loyalty', 'config')))));
  check('mijozlar/xabarlarga umuman kira olmaydi', !(await allowed(() => getDoc(doc(db, 'loyaltyUsers', '1')))) && !(await allowed(() => getDoc(doc(db, 'broadcasts', 'b1')))));

  console.log('\n[admin]');
  await as('admin');
  check('sozlamani yoza oladi', await allowed(() => setDoc(doc(db, 'loyalty', 'config'), { enabled: true, boost: { enabled: false } }, { merge: true })));
  check('claim o‘qiy oladi', await allowed(() => getDoc(doc(db, 'claims', 'AAAA1111'))));
  check('claim o‘zgartira olmaydi (faqat server)', !(await allowed(() => updateDoc(doc(db, 'claims', 'AAAA1111'), { cashback: 1 }))));
  check('mijoz va harakatlarni o‘qiy oladi', await allowed(() => getDoc(doc(db, 'loyaltyUsers', '1'))));
  check('mijoz balansini to‘g‘ridan-to‘g‘ri yoza olmaydi', !(await allowed(() => updateDoc(doc(db, 'loyaltyUsers', '1'), { balance: 5 }))));
  check('redemption o‘qiy oladi, yoza olmaydi', (await allowed(() => getDoc(doc(db, 'redemptions', 'r1')))) && !(await allowed(() => updateDoc(doc(db, 'redemptions', 'r1'), { amount: 0 }))));
  check('qoralama xabar yarata oladi', await allowed(() => setDoc(doc(db, 'broadcasts', 'b1'), { id: 'b1', status: 'draft', text: 'salom' })));
  check('“sending” holatda yarata olmaydi', !(await allowed(() => setDoc(doc(db, 'broadcasts', 'b2'), { id: 'b2', status: 'sending', text: 'x' }))));
  check('qoralama matnini tahrirlay oladi', await allowed(() => updateDoc(doc(db, 'broadcasts', 'b1'), { text: 'yangi matn' })));
  check('holatni qo‘lda “done” qila olmaydi', !(await allowed(() => updateDoc(doc(db, 'broadcasts', 'b1'), { status: 'done' }))));
  check('reklamani yoza/o‘qiy oladi', await allowed(() => setDoc(doc(db, 'ads', 'ad1'), { id: 'ad1', title: 'x', active: true })) && await allowed(() => getDoc(doc(db, 'ads', 'ad1'))));
  check('media o‘qiy oladi, qo‘lda yarata olmaydi', (await allowed(() => getDoc(doc(db, 'loyaltyMedia', 'm1')))) && !(await allowed(() => setDoc(doc(db, 'loyaltyMedia', 'm2'), { type: 'photo', fileId: 'x' }))));
  void uids;

  console.log(`\n=== Qoidalar natijasi: ${passed} o‘tdi, ${failed} muvaffaqiyatsiz ===`);
  process.exit(failed ? 1 : 0);
}

main().catch(error => { console.error('TEST XATOSI:', error); process.exit(2); });
