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

  // ---------------------------------------------------------------- menyudan tashqari pozitsiya ("=" tugmasi)
  await admin.collection('sessions').doc('S-ACT').set({ id: 'S-ACT', status: 'active', bookedHours: 2, itemsTotal: 100000, paidTotal: 0, discount: 0, roomId: 'r1', roomNumber: 'VIP 01', waiterId: uids.waiter });
  await admin.collection('sessions').doc('S-PAID').set({ id: 'S-PAID', status: 'paid', bookedHours: 2, itemsTotal: 50000, paidTotal: 50000, discount: 0, roomId: 'r1', roomNumber: 'VIP 01', waiterId: uids.waiter });
  const customOrder = (id: string, over: Record<string, unknown> = {}, itemOver: Record<string, unknown> = {}) => ({
    id, orderNumber: id, source: 'room', sessionId: 'S-ACT', roomId: 'r1', roomNumber: 'VIP 01', barStaffId: auth.currentUser!.uid, barStaffName: 'x',
    items: [{ id: 'i1', productId: 'custom:i1', productName: 'Jarima', productNameRu: 'Jarima', quantity: 1, unitPrice: 50000, totalPrice: 50000, custom: true, ...itemOver }],
    totalAmount: 50000, status: 'served', customOnly: true, inventoryDeducted: false, createdAt: now, updatedAt: now, servedAt: now, ...over,
  });
  /** Tranzaksiya kabi: custom buyurtma + sessiya itemsTotal ni oshirish. */
  const addCustom = async (id: string, itemsTotal: number, over: Record<string, unknown> = {}, itemOver: Record<string, unknown> = {}, sessionId = 'S-ACT') => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'orders', id), customOrder(id, { sessionId, ...over }, itemOver));
    batch.update(doc(db, 'sessions', sessionId), { itemsTotal });
    await batch.commit();
  };

  console.log('\n[menyudan tashqari pozitsiya — kassir]');
  await as('bar');
  check('custom buyurtma + itemsTotal oshirish ruxsat', await allowed(() => addCustom('CU1', 150000)));
  check('itemsTotal ni kamaytira olmaydi', !(await allowed(() => updateDoc(doc(db, 'sessions', 'S-ACT'), { itemsTotal: 10 }))));
  check('customOnly bo‘lmagan xona buyurtmasini yarata olmaydi', !(await allowed(() => addCustom('CU2', 200000, { customOnly: false }))));
  check('pozitsiya custom bo‘lmasa rad etiladi', !(await allowed(() => addCustom('CU3', 200000, {}, { custom: false }))));
  check('productId “custom:” bilan boshlanmasa rad etiladi', !(await allowed(() => addCustom('CU4', 200000, {}, { productId: 'prod-1' }))));
  check('narx 0 bo‘lsa rad etiladi', !(await allowed(() => addCustom('CU5', 200000, {}, { totalPrice: 0 }))));
  check('boshqa kassir nomidan yarata olmaydi', !(await allowed(() => addCustom('CU6', 200000, { barStaffId: uids.admin }))));
  check('“new” holatda yarata olmaydi', !(await allowed(() => addCustom('CU7', 200000, { status: 'new' }))));
  check('ikkita pozitsiyali custom rad etiladi', !(await allowed(() => addCustom('CU8', 200000, { items: [customOrder('x').items[0], customOrder('y').items[0]] }))));
  check('to‘langan sessiyaga qo‘sha olmaydi', !(await allowed(() => addCustom('CU9', 90000, {}, {}, 'S-PAID'))));
  check('bar savdosi (oddiy) yaratish hali ham ishlaydi', await allowed(() => setDoc(doc(db, 'orders', 'BAR1'), { id: 'BAR1', source: 'bar', status: 'served', barStaffId: auth.currentUser!.uid, items: [{ id: 'i', productId: 'prod-1', productName: 'x', productNameRu: 'x', quantity: 1, unitPrice: 1000, totalPrice: 1000 }], totalAmount: 1000, createdAt: now, updatedAt: now })));

  console.log('\n[menyudan tashqari pozitsiya — ofitsiant]');
  await as('waiter');
  check('custom buyurtma yarata olmaydi', !(await allowed(() => addCustom('CW1', 250000, { barStaffId: auth.currentUser!.uid }))));
  check('custom buyurtmani o‘qiy oladi', await allowed(() => getDoc(doc(db, 'orders', 'CU1'))));
  check('itemsTotal ni oshira oladi (oddiy buyurtma) va custom-sessiya summasini kamaytira olmaydi', await allowed(() => updateDoc(doc(db, 'sessions', 'S-ACT'), { itemsTotal: 160000 })) && !(await allowed(() => updateDoc(doc(db, 'sessions', 'S-ACT'), { itemsTotal: 1 }))));

  console.log('\n[menyudan tashqari pozitsiya — admin]');
  await as('admin');
  check('custom buyurtma yarata oladi', await allowed(() => addCustom('CA1', 210000, { barStaffId: auth.currentUser!.uid })));

  console.log(`\n=== Qoidalar natijasi: ${passed} o‘tdi, ${failed} muvaffaqiyatsiz ===`);
  process.exit(failed ? 1 : 0);
}

main().catch(error => { console.error('TEST XATOSI:', error); process.exit(2); });
