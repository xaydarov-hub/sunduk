/* Telegram sodiqlik botining to'liq sinovi: haqiqiy webhook/funksiyalar + Firestore emulyatori + soxta Telegram serveri.
 * Ishga tushirish:  npm run emulators   (boshqa oynada)   →   npm run test:bot
 */
import http from 'node:http';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-sunduk';
process.env.FB_PROJECT_ID = 'demo-sunduk';
process.env.TELEGRAM_BOT_TOKEN = 'test-token-123';
process.env.TG_WEBHOOK_SECRET = 's3cret';
process.env.TG_ADMIN_IDS = '5916247309';
process.env.SPIN_WAIT_MS = '0';
process.env.BROADCAST_PAUSE_MS = '0';
process.env.CRON_PACE_MS = '0';

type Call = { method: string; body: any };
const calls: Call[] = [];
const diceQueue: number[] = [];
const memberStatus: Record<string, string> = {};
const forbidden = new Set<number>();

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => (raw += c));
  req.on('end', () => {
    const method = (req.url || '').split('/').pop() as string;
    const body = raw ? JSON.parse(raw) : {};
    calls.push({ method, body });
    const ok = (result: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result })); };
    if (method === 'sendDice') return ok({ message_id: 1, dice: { emoji: '🎲', value: diceQueue.shift() ?? 4 } });
    if (method === 'getMe') return ok({ id: 999, username: 'sunduk_test_bot' });
    if (method === 'getChatMember') return ok({ status: memberStatus[String(body.chat_id)] ?? 'member' });
    if (method === 'getChat') return ok({ id: -100, title: 'Test kanal' });
    if (method === 'getWebhookInfo') return ok({ url: 'https://x/hook', pending_update_count: 0 });
    if (forbidden.has(Number(body.chat_id)) && /^send/.test(method)) { res.statusCode = 403; return res.end(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' })); }
    return ok({ message_id: 7 });
  });
});

let passed = 0; let failed = 0;
function check(name: string, cond: unknown, extra?: unknown) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const sentTo = (chat: number | string) => calls.filter(c => /^send/.test(c.method) && String(c.body.chat_id) === String(chat));
const lastText = (chat: number | string) => { const l = sentTo(chat).filter(c => c.body.text || c.body.caption); return String(l[l.length - 1]?.body.text ?? l[l.length - 1]?.body.caption ?? ''); };
const allText = (chat: number | string) => sentTo(chat).map(c => String(c.body.text ?? c.body.caption ?? '')).join('\n---\n');

async function main() {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.TG_API_BASE = `http://127.0.0.1:${(server.address() as any).port}`;

  const { db, adminAuth } = await import('../netlify/lib/admin');
  const webhook = (await import('../netlify/functions/tg-webhook.mts')).default;
  const api = (await import('../netlify/functions/loyalty-api.mts')).default;
  const broadcastFn = (await import('../netlify/functions/tg-broadcast-background.mts')).default;
  const cronFn = (await import('../netlify/functions/loyalty-cron.mts')).default;
  const { runDaily } = await import('../netlify/lib/cron');
  const { DEFAULT_LOYALTY, makeCode } = await import('../src/lib/loyalty/shared');
  const firestore = db();

  // ---- tozalash
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sunduk/databases/%28default%29/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-sunduk/accounts', { method: 'DELETE' });

  let updateId = 1000;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const hook = (update: any) => webhook(post('/.netlify/functions/tg-webhook', { update_id: ++updateId, ...update }, { 'x-telegram-bot-api-secret-token': 's3cret' }));
  const say = (uid: number, text: string, extra: any = {}) => hook({ message: { chat: { id: uid, type: 'private' }, from: { id: uid, first_name: `User${uid}`, username: `u${uid}`, language_code: 'uz' }, text, ...extra } });
  const tap = (uid: number, data: string, messageId = 55) => hook({ callback_query: { id: `cb${updateId}`, from: { id: uid, first_name: `User${uid}` }, message: { chat: { id: uid, type: 'private' }, message_id: messageId }, data } });
  const contact = (uid: number, phone: string, asId = uid) => say(uid, '', { text: undefined, contact: { phone_number: phone, user_id: asId } });

  // ---- boshlang'ich ma'lumot: sozlamalar, config, xodimlar, to'lovlar, claim'lar
  await firestore.collection('settings').doc('main').set({ businessName: 'Sunduk Test', businessPhone: '+998901112233', businessAddress: 'Toshkent' });
  await firestore.collection('loyalty').doc('config').set({ ...DEFAULT_LOYALTY, enabled: true, botUsername: 'sunduk_test_bot', adminChatIds: [] });

  const mkReceipt = async (receiptNumber: string, amount: number, opts: { ageHours?: number; payments?: number; method?: string } = {}) => {
    const code = makeCode();
    const paymentIds: string[] = [];
    const per = Math.round(amount / (opts.payments ?? 1));
    for (let i = 0; i < (opts.payments ?? 1); i++) {
      const id = `pay-${receiptNumber}-${i}`;
      await firestore.collection('payments').doc(id).set({ id, amount: per, method: opts.method ?? 'cash', receiptNumber, status: 'confirmed', createdAt: new Date().toISOString() });
      paymentIds.push(id);
    }
    const createdAt = new Date(Date.now() - (opts.ageHours ?? 0) * 3600 * 1000).toISOString();
    await firestore.collection('claims').doc(code).set({ code, receiptNumber, amount: per * (opts.payments ?? 1), paymentIds, roomNumber: 'VIP 05', waiterName: 'Sardor', cashierName: 'Bobur', createdAt, status: 'open' });
    return code;
  };

  console.log('\n[1] Xavfsizlik');
  const bad = await webhook(post('/x', { update_id: 1, message: {} }, { 'x-telegram-bot-api-secret-token': 'wrong' }));
  check('noto‘g‘ri secret → 403', bad.status === 403);
  const noSecret = await webhook(post('/x', { update_id: 2, message: {} }));
  check('secretsiz → 403', noSecret.status === 403);

  console.log('\n[2] /start va birinchi cashback');
  calls.length = 0;
  await say(111, '/start');
  check('xush kelibsiz xabari + menyu', /Sunduk Test/.test(lastText(111)) && sentTo(111)[0].body.reply_markup?.keyboard?.length >= 4, lastText(111));
  check('xush kelibsiz xabarida 3% bor', /3% cashback/.test(lastText(111)));
  const dupCount = calls.length;
  const dupUpdate = { update_id: 424242, message: { chat: { id: 111, type: 'private' }, from: { id: 111, first_name: 'User111' }, text: '/start' } };
  await webhook(post('/x', dupUpdate, { 'x-telegram-bot-api-secret-token': 's3cret' }));
  const afterFirst = calls.length;
  await webhook(post('/x', dupUpdate, { 'x-telegram-bot-api-secret-token': 's3cret' }));
  check('takroriy update_id e’tiborsiz qoldiriladi', afterFirst > dupCount && calls.length === afterFirst);

  const code1 = await mkReceipt('RCP-00001', 335000);
  calls.length = 0;
  await say(111, `/start r_${code1}`);
  check('telefon so‘raladi (hali cashback yo‘q)', /telefon/i.test(lastText(111)) && sentTo(111)[0].body.reply_markup?.keyboard?.[0]?.[0]?.request_contact === true, lastText(111));
  let user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('kutilayotgan kod saqlandi', user.pendingCode === code1 && user.balance === 0);

  calls.length = 0;
  await contact(111, '+998 90 111 22 33', 222); // boshqa odamning kontakti
  check('begona kontakt rad etildi', /o‘zingizning/.test(lastText(111)));
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('begona kontaktda cashback berilmadi', !user.phone && user.balance === 0);

  calls.length = 0;
  await contact(111, '+998 90 111 22 33');
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  const expectCashback = Math.floor(335000 * 0.03); // 10 050
  check('telefon saqlandi', user.phone === '+998901112233');
  check(`cashback = ${expectCashback} + 5000 xush kelibsiz`, user.balance === expectCashback + 5000, user.balance);
  check('totalSpent, claims, spinTickets', user.totalSpent === 335000 && user.claims === 1 && user.spinTickets === 1, user);
  check('xabarda summa va cashback ko‘rinadi', /10 050/.test(allText(111)) && /RCP-00001/.test(allText(111)), allText(111).slice(0, 400));
  check('baholash tugmalari yuborildi', sentTo(111).some(c => JSON.stringify(c.body.reply_markup || {}).includes('rate:')));
  const claim1 = (await firestore.collection('claims').doc(code1).get()).data()!;
  check('claim yopildi', claim1.status === 'claimed' && claim1.claimedBy === '111' && claim1.cashback === expectCashback);

  console.log('\n[3] Qayta/begona/eskirgan/soxta chek');
  calls.length = 0;
  await say(111, `/start r_${code1}`);
  check('o‘z chekini qayta skanerlash', /allaqachon qo‘shilgan/.test(lastText(111)), lastText(111));
  await say(333, '/start');
  await firestore.collection('loyaltyUsers').doc('333').set({ phone: '+998903333333' }, { merge: true });
  calls.length = 0;
  await say(333, `/start r_${code1}`);
  check('boshqa odam ishlatolmaydi', /boshqa hisobga/.test(lastText(333)), lastText(333));
  const oldCode = await mkReceipt('RCP-00002', 100000, { ageHours: 100 });
  calls.length = 0;
  await say(333, `/start r_${oldCode}`);
  check('72 soatdan eski chek rad etiladi', /muddati o‘tgan/.test(lastText(333)), lastText(333));
  calls.length = 0;
  await say(333, '/start r_ZZZZZZZZZZZZ');
  check('mavjud emas kod', /topilmadi/.test(lastText(333)), lastText(333));
  const fakeCode = makeCode();
  await firestore.collection('claims').doc(fakeCode).set({ code: fakeCode, receiptNumber: 'RCP-FAKE', amount: 5_000_000, paymentIds: ['pay-yoq'], createdAt: new Date().toISOString(), status: 'open' });
  calls.length = 0;
  await say(333, `/start r_${fakeCode}`);
  check('to‘lovsiz soxta claim rad etiladi', /tasdiqlab bo‘lmadi/.test(lastText(333)), lastText(333));
  const bonusCode = await mkReceipt('RCP-00003', 50000, { method: 'bonus' });
  calls.length = 0;
  await say(333, `/start r_${bonusCode}`);
  check('cashback bilan to‘langan qismga cashback berilmaydi', /tasdiqlab bo‘lmadi/.test(lastText(333)), lastText(333));
  const u333 = (await firestore.collection('loyaltyUsers').doc('333').get()).data()!;
  check('soxta urinishlar balansga ta’sir qilmadi', u333.balance === 0);

  console.log('\n[4] Daraja va aksiya kuni');
  const bigCode = await mkReceipt('RCP-00004', 1_500_000);
  calls.length = 0;
  await say(111, `/start r_${bigCode}`);
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('1 500 000 dan keyin Kumush darajasi', user.tier === 'silver' && user.totalSpent === 1_835_000, user);
  check('daraja ko‘tarilgani haqida xabar', /yangi daraja|Yangi daraja/i.test(lastText(111)) || /Kumush/.test(allText(111)), allText(111).slice(0, 300));
  const nextCode = await mkReceipt('RCP-00005', 100000);
  const before = user.balance;
  await say(111, `/start r_${nextCode}`);
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('Kumush: 4% cashback', user.balance - before === 4000, user.balance - before);
  await firestore.collection('loyalty').doc('config').set({ boost: { enabled: true, weekdays: [0, 1, 2, 3, 4, 5, 6], extraPercent: 2 } }, { merge: true });
  const boostCode = await mkReceipt('RCP-00006', 100000);
  const b2 = user.balance;
  await say(111, `/start r_${boostCode}`);
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('aksiya kuni: 4% + 2% = 6%', user.balance - b2 === 6000, user.balance - b2);
  check('aksiya belgisi xabarda', /aksiya kuni/.test(lastText(111)) || /aksiya kuni/.test(allText(111)));
  await firestore.collection('loyalty').doc('config').set({ boost: { enabled: false, weekdays: [1, 2], extraPercent: 2 } }, { merge: true });

  console.log('\n[5] Omad o‘yini');
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  const tickets = user.spinTickets; const balBefore = user.balance;
  diceQueue.push(6);
  calls.length = 0;
  await tap(111, 'spin');
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('zar tashlandi', calls.some(c => c.method === 'sendDice'));
  check('6 tushdi → 5 000 yutuq', user.balance === balBefore + 5000, user.balance - balBefore);
  check('urinish kamaydi', user.spinTickets === tickets - 1);
  await say(222, '/start');
  calls.length = 0;
  await tap(222, 'spin');
  check('urinishsiz foydalanuvchi o‘ynay olmaydi', !calls.some(c => c.method === 'sendDice') && /Urinish yo‘q/.test(lastText(222)), lastText(222));
  // poyga: bitta urinish, 2 ta parallel bosish
  await firestore.collection('loyaltyUsers').doc('111').update({ spinTickets: 1 });
  diceQueue.push(3, 3);
  calls.length = 0;
  await Promise.all([tap(111, 'spin'), tap(111, 'spin')]);
  check('parallel bosishda faqat bitta zar tashlanadi', calls.filter(c => c.method === 'sendDice').length === 1, calls.filter(c => c.method === 'sendDice').length);

  console.log('\n[6] Taklif (referal)');
  await say(444, `/start ref_111`);
  const refU = (await firestore.collection('loyaltyUsers').doc('444').get()).data()!;
  check('taklif qilgan saqlandi', refU.refBy === '111');
  const refCode = await mkReceipt('RCP-00007', 200000);
  const inviterBefore = ((await firestore.collection('loyaltyUsers').doc('111').get()).data()!).balance;
  await say(444, `/start r_${refCode}`);
  await contact(444, '+998904444444');
  const inv = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  const inv2 = (await firestore.collection('loyaltyUsers').doc('444').get()).data()!;
  check('taklif qilganga 10 000 bonus', inv.balance - inviterBefore === 10000 && inv.refCount === 1, inv.balance - inviterBefore);
  check('taklif qilingan: 6 000 cashback + 5 000 + 5 000', inv2.balance === 6000 + 5000 + 5000, inv2.balance);
  check('taklif qilganga xabar bordi', /birinchi xaridini qildi/.test(allText(111)));
  // ikkinchi chek — taklif bonusi qayta berilmaydi
  const refCode2 = await mkReceipt('RCP-00008', 100000);
  await say(444, `/start r_${refCode2}`);
  const inv3 = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('taklif bonusi faqat birinchi chekka', inv3.balance === inv.balance && inv3.refCount === 1);
  // o'zini o'zi taklif qilolmaydi
  await say(555, `/start ref_555`);
  check('o‘zini o‘zi taklif qila olmaydi', !((await firestore.collection('loyaltyUsers').doc('555').get()).data()!).refBy);

  console.log('\n[7] Telefon takrorlanmasligi');
  await say(666, '/start');
  calls.length = 0;
  await contact(666, '+998 90 111 22 33');
  check('boshqa hisobdagi raqam qabul qilinmaydi', /boshqa hisobga/.test(lastText(666)), lastText(666));

  console.log('\n[8] Baholash');
  const rateCode = await mkReceipt('RCP-00009', 80000);
  await say(111, `/start r_${rateCode}`);
  calls.length = 0;
  await tap(111, `rate:${rateCode}:2`);
  const rated = (await firestore.collection('claims').doc(rateCode).get()).data()!;
  check('baho saqlandi', rated.rating === 2);
  check('past baho adminga yuborildi (xona, ofitsiant)', /Past baho: 2/.test(allText(5916247309)) && /VIP 05/.test(allText(5916247309)) && /Sardor/.test(allText(5916247309)), allText(5916247309));
  calls.length = 0;
  await tap(111, `rate:${rateCode}:5`);
  check('baho ikki marta o‘zgarmaydi', ((await firestore.collection('claims').doc(rateCode).get()).data()!).rating === 2 && !allText(5916247309).includes('Past baho'));
  await tap(333, `rate:${rateCode}:1`);
  check('begona odam baho qo‘ya olmaydi', ((await firestore.collection('claims').doc(rateCode).get()).data()!).rating === 2);

  console.log('\n[9] Cashbackni kassada ishlatish');
  const staffToken = async (email: string, role: 'bar' | 'admin' | 'waiter', active = true) => {
    const rec = await adminAuth().createUser({ email, password: 'Secret123' });
    await firestore.collection('users').doc(rec.uid).set({ id: rec.uid, name: email.split('@')[0], role, isActive: active });
    const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Secret123', returnSecureToken: true }) });
    return (await r.json()).idToken as string;
  };
  const barToken = await staffToken('bobur@sunduk.uz', 'bar');
  const adminToken = await staffToken('owner@sunduk.uz', 'admin');
  const waiterToken = await staffToken('sardor@sunduk.uz', 'waiter');
  const inactiveToken = await staffToken('old@sunduk.uz', 'bar', false);
  const call = async (token: string | null, body: any) => { const res = await api(post('/.netlify/functions/loyalty-api', body, token ? { authorization: `Bearer ${token}` } : {})); return { status: res.status, data: await res.json() as any }; };

  check('tokensiz so‘rov rad etiladi', (await call(null, { action: 'lookup', code: '123456' })).status === 403);
  check('ofitsiant API’dan foydalana olmaydi', (await call(waiterToken, { action: 'lookup', code: '123456' })).status === 403);
  check('faolsiz xodim rad etiladi', (await call(inactiveToken, { action: 'lookup', code: '123456' })).status === 403);
  check('kassir admin amalini bajara olmaydi', (await call(barToken, { action: 'adjust', userId: '111', amount: 1000 })).status === 403);

  calls.length = 0;
  await say(111, '💳 Cashback ishlatish');
  const codeText = lastText(111);
  const redeemCode = (codeText.match(/(\d{3}) (\d{3})/) || []).slice(1).join('');
  check('6 xonali kod berildi', redeemCode.length === 6, codeText);
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  const startBal = user.balance;
  let r = await call(barToken, { action: 'lookup', code: redeemCode, due: 100000 });
  check('lookup: ism, balans, 30% limit', r.data.ok && r.data.info.balance === startBal && r.data.info.max === Math.min(startBal, 30000), r.data);
  check('lookup telefonni yashiradi', /\*\*\*/.test(r.data.info.phone), r.data.info.phone);
  r = await call(barToken, { action: 'redeem', code: redeemCode, amount: 40000, due: 100000 });
  check('30% dan oshiq — rad etiladi', !r.data.ok && r.data.code === 'OVER_LIMIT', r.data);
  r = await call(barToken, { action: 'redeem', code: redeemCode, amount: 500, due: 100000 });
  check('minimal summadan kam — rad etiladi', !r.data.ok && r.data.code === 'AMOUNT_LOW', r.data);
  calls.length = 0;
  const [rA, rB] = await Promise.all([call(barToken, { action: 'redeem', code: redeemCode, amount: 20000, due: 100000 }), call(barToken, { action: 'redeem', code: redeemCode, amount: 20000, due: 100000 })]);
  const okCount = [rA, rB].filter(x => x.data.ok).length;
  check('parallel ikki marta ishlatishda faqat bittasi o‘tadi', okCount === 1, [rA.data, rB.data]);
  const done = [rA, rB].find(x => x.data.ok)!;
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('balansdan 20 000 yechildi', user.balance === startBal - 20000 && done.data.balance === startBal - 20000, user.balance);
  check('mijozga xabar yuborildi', /20 000/.test(allText(111)) && /to‘landi/.test(allText(111)), allText(111));
  r = await call(barToken, { action: 'lookup', code: redeemCode, due: 100000 });
  check('ishlatilgan kod qayta yaroqsiz', !r.data.ok && r.data.code === 'CODE_USED', r.data);
  r = await call(barToken, { action: 'refund', id: done.data.id });
  user = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('to‘lov bajarilmasa — qaytariladi', r.data.ok && user.balance === startBal, user.balance);
  r = await call(barToken, { action: 'refund', id: done.data.id });
  check('ikkinchi marta qaytarib bo‘lmaydi', !r.data.ok && r.data.code === 'NOT_HELD', r.data);
  await say(111, '💳 Cashback ishlatish');
  const code2 = ((lastText(111).match(/(\d{3}) (\d{3})/) || []).slice(1).join(''));
  const ok2 = await call(barToken, { action: 'redeem', code: code2, amount: 10000, due: 100000 });
  await call(barToken, { action: 'confirm', id: ok2.data.id, receiptNumber: 'RCP-00099' });
  const redDoc = (await firestore.collection('redemptions').doc(ok2.data.id).get()).data()!;
  check('tasdiqlangach status = applied', redDoc.status === 'applied' && redDoc.receiptNumber === 'RCP-00099');
  r = await call(barToken, { action: 'refund', id: ok2.data.id });
  check('qo‘llangan yozuvni qaytarib bo‘lmaydi', !r.data.ok && r.data.code === 'NOT_HELD');
  r = await call(barToken, { action: 'lookup', code: '000000', due: 1000 });
  check('noto‘g‘ri kod', !r.data.ok && r.data.code === 'CODE_INVALID', r.data);
  // muddati o'tgan
  await firestore.collection('redeemCodes').doc('777777').set({ userId: '111', status: 'open', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString() });
  r = await call(barToken, { action: 'lookup', code: '777777', due: 1000 });
  check('muddati o‘tgan kod', !r.data.ok && r.data.code === 'CODE_EXPIRED', r.data);

  console.log('\n[10] Admin amallari');
  r = await call(adminToken, { action: 'adjust', userId: '333', amount: 7000, note: 'Kechirim' });
  check('admin balansga qo‘shdi', r.data.ok && r.data.balance === 7000, r.data);
  check('mijozga xabar bordi', /7 000/.test(allText(333)));
  r = await call(adminToken, { action: 'adjust', userId: '333', amount: -99999 });
  check('manfiy balans bo‘lishi mumkin emas', !r.data.ok && r.data.code === 'NO_FUNDS', r.data);
  r = await call(adminToken, { action: 'userUpdate', userId: '666', blocked: true });
  calls.length = 0;
  await say(666, '/start');
  check('bloklangan mijoz xizmatdan foydalana olmaydi', /bloklangan/.test(lastText(666)));
  await call(adminToken, { action: 'userUpdate', userId: '666', blocked: false });
  r = await call(adminToken, { action: 'audienceCount', audience: { type: 'all' } });
  check('auditoriya soni', r.data.ok && r.data.count >= 5, r.data);
  r = await call(adminToken, { action: 'audienceCount', audience: { type: 'tier', tier: 'silver' } });
  check('daraja bo‘yicha auditoriya', r.data.ok && r.data.count === 1, r.data);
  r = await call(adminToken, { action: 'status' });
  check('status: bot va admin ID', r.data.ok && r.data.botUsername === 'sunduk_test_bot' && r.data.admins.includes('5916247309'), r.data);
  r = await call(adminToken, { action: 'setup' });
  check('setup ishladi', r.data.ok && r.data.botUsername === 'sunduk_test_bot', r.data);
  check('setup mavjud sozlamani o‘chirmadi', ((await firestore.collection('loyalty').doc('config').get()).data()!).enabled === true);

  console.log('\n[11] Admin: media va /stat');
  calls.length = 0;
  await hook({ message: { chat: { id: 5916247309, type: 'private' }, from: { id: 5916247309, first_name: 'Egasi' }, photo: [{ file_id: 'small' }, { file_id: 'BIGPHOTO' }], caption: 'Aksiya' } });
  const media = await firestore.collection('loyaltyMedia').get();
  check('rasm media kutubxonasiga saqlandi (eng kattasi)', media.size === 1 && media.docs[0].data().fileId === 'BIGPHOTO' && media.docs[0].data().type === 'photo');
  await hook({ message: { chat: { id: 111, type: 'private' }, from: { id: 111, first_name: 'User111' }, photo: [{ file_id: 'x' }] } });
  check('oddiy mijoz media saqlay olmaydi', (await firestore.collection('loyaltyMedia').get()).size === 1);
  calls.length = 0;
  await hook({ message: { chat: { id: 5916247309, type: 'private' }, from: { id: 5916247309, first_name: 'Egasi' }, text: '/stat' } });
  check('/stat bugungi hisobot', /Bugun/.test(lastText(5916247309)) && /Skanerlangan cheklar/.test(lastText(5916247309)), lastText(5916247309));
  calls.length = 0;
  await say(111, '/stat');
  check('/stat oddiy mijozga ko‘rsatilmaydi', !/Skanerlangan cheklar/.test(allText(111)));

  console.log('\n[12] Reklama va aksiyalar');
  await firestore.collection('ads').doc('a1').set({ id: 'a1', title: 'Juma aksiyasi', text: 'Juma kuni <b>2x cashback</b>!', active: true, showAfterClaim: true, order: 1, buttonText: 'Bron', buttonUrl: 'https://t.me/x', createdAt: new Date().toISOString() });
  await firestore.collection('ads').doc('a2').set({ id: 'a2', title: 'Eski', text: 'tugagan', active: true, showAfterClaim: false, order: 2, endsAt: new Date(Date.now() - 86400000).toISOString(), createdAt: new Date().toISOString() });
  await firestore.collection('ads').doc('a3').set({ id: 'a3', title: 'Rasmli', text: 'surat', active: true, showAfterClaim: false, order: 3, mediaType: 'photo', mediaFileId: 'PHOTOID', createdAt: new Date().toISOString() });
  calls.length = 0;
  await say(111, '🎁 Aksiyalar');
  check('faol aksiyalar ko‘rsatiladi', /Juma aksiyasi/.test(allText(111)) && /Rasmli/.test(allText(111)));
  check('muddati o‘tgan aksiya ko‘rinmaydi', !/Eski/.test(allText(111)));
  check('rasmli aksiya sendPhoto bilan', calls.some(c => c.method === 'sendPhoto' && c.body.photo === 'PHOTOID'));
  const adCode = await mkReceipt('RCP-00010', 60000);
  calls.length = 0;
  await say(111, `/start r_${adCode}`);
  check('chekdan keyin reklama qo‘shildi', /Juma aksiyasi/.test(allText(111)));

  console.log('\n[13] Majburiy kanal');
  await firestore.collection('loyalty').doc('config').set({ channels: ['@testchan'] }, { merge: true });
  memberStatus['@testchan'] = 'left';
  await say(777, '/start');
  calls.length = 0;
  const gateCode = await mkReceipt('RCP-00011', 90000);
  await say(777, `/start r_${gateCode}`);
  check('obuna bo‘lmasa — kanal so‘raladi', /@testchan/.test(lastText(777)) && JSON.stringify(sentTo(777).pop()!.body.reply_markup).includes('chk'), lastText(777));
  await firestore.collection('loyaltyUsers').doc('777').set({ phone: '+998907777777' }, { merge: true });
  calls.length = 0;
  await tap(777, 'chk');
  check('obuna bo‘lmaganda tekshirish rad etadi', /obuna bo‘lmadingiz/.test(allText(777)));
  memberStatus['@testchan'] = 'member';
  calls.length = 0;
  await tap(777, 'chk');
  check('obuna bo‘lgach kutilgan chek avtomatik hisoblandi', /tasdiqlandi/.test(allText(777)), allText(777));
  await firestore.collection('loyalty').doc('config').set({ channels: [] }, { merge: true });

  console.log('\n[14] Ommaviy xabar');
  await firestore.collection('loyaltyUsers').doc('666').set({ botBlocked: false }, { merge: true });
  forbidden.add(666);
  const bId = 'bc1';
  await firestore.collection('broadcasts').doc(bId).set({ id: bId, text: 'Salom {ism}! Balansingiz: {balans}', audience: { type: 'all' }, status: 'draft', total: 0, sent: 0, failed: 0, blocked: 0, createdAt: new Date().toISOString(), createdBy: 'x', mediaType: 'photo', mediaFileId: 'BIGPHOTO', buttonText: 'Ochish', buttonUrl: 'https://example.com' });
  r = await call(adminToken, { action: 'testBroadcast', id: bId });
  check('sinov xabari adminga bordi (shaxsiylashgan)', r.data.ok && r.data.results[0].ok && /Ism/.test(String(sentTo(5916247309).pop()!.body.caption)), r.data);
  calls.length = 0;
  const bres = await broadcastFn(post('/x', { id: bId }, { authorization: `Bearer ${adminToken}` }));
  check('fon funksiyasi ishladi', bres.status === 200);
  const bdoc = (await firestore.collection('broadcasts').doc(bId).get()).data()!;
  const usersAll = (await firestore.collection('loyaltyUsers').get()).docs.map(d => d.data());
  const expectedTotal = usersAll.filter(u => !u.blocked).length;
  check('holat done, total to‘g‘ri', bdoc.status === 'done' && bdoc.total === expectedTotal, bdoc);
  check('bloklagan foydalanuvchi aniqlandi (403)', bdoc.blocked === 1 && bdoc.sent === expectedTotal - 1, bdoc);
  check('bloklagan mijoz belgilandi', ((await firestore.collection('loyaltyUsers').doc('666').get()).data()!).botBlocked === true);
  check('rasm + tugma yuborildi', calls.some(c => c.method === 'sendPhoto' && c.body.photo === 'BIGPHOTO' && JSON.stringify(c.body.reply_markup).includes('example.com')));
  check('{ism} va {balans} almashtirildi', calls.some(c => c.method === 'sendPhoto' && String(c.body.chat_id) === '111' && /Salom User111! Balansingiz: \d/.test(c.body.caption)), calls.filter(c => c.method === 'sendPhoto').slice(0, 2).map(c => c.body.caption));
  const callsBeforeAgain = calls.length;
  const again = await broadcastFn(post('/x', { id: bId }, { authorization: `Bearer ${adminToken}` }));
  check('tugagan xabar qayta yuborilmaydi', again.status === 200 && calls.length === callsBeforeAgain, calls.length - callsBeforeAgain);
  const noAuth = await broadcastFn(post('/x', { id: bId }, { authorization: `Bearer ${barToken}` }));
  check('kassir ommaviy xabar yubora olmaydi', noAuth.status === 403);
  forbidden.delete(666);

  console.log('\n[15] Kunlik avtomatik vazifalar');
  const old = new Date(Date.now() - 85 * 86400000).toISOString();
  await firestore.collection('loyaltyUsers').doc('888').set({ id: '888', tgId: 888, name: 'Eski Mijoz', lang: 'uz', balance: 20000, totalSpent: 100000, claims: 1, tier: 'bronze', refCount: 0, createdAt: old, lastSeenAt: old, lastActivityAt: old, lastClaimAt: old, totalEarned: 20000, totalRedeemed: 0, spinTickets: 0 });
  await firestore.collection('loyaltyUsers').doc('889').set({ id: '889', tgId: 889, name: 'Juda Eski', lang: 'ru', balance: 15000, totalSpent: 100000, claims: 1, tier: 'bronze', refCount: 0, createdAt: old, lastSeenAt: old, lastActivityAt: new Date(Date.now() - 95 * 86400000).toISOString(), lastClaimAt: new Date(Date.now() - 95 * 86400000).toISOString(), totalEarned: 15000, totalRedeemed: 0, spinTickets: 0 });
  const tz = new Date(Date.now() + 5 * 3600000);
  const md = `${String(tz.getUTCMonth() + 1).padStart(2, '0')}-${String(tz.getUTCDate()).padStart(2, '0')}`;
  await firestore.collection('loyaltyUsers').doc('444').set({ birthday: md }, { merge: true });
  const b444 = ((await firestore.collection('loyaltyUsers').doc('444').get()).data()!).balance;
  calls.length = 0;
  const cres = await cronFn();
  const cout = await cres.json() as any;
  check('kron ishladi', cres.status === 200, cout);
  check('tug‘ilgan kun sovg‘asi', ((await firestore.collection('loyaltyUsers').doc('444').get()).data()!).balance === b444 + 20000 && /Tug‘ilgan kuningiz bilan/.test(allText(444)), allText(444));
  const u888 = (await firestore.collection('loyaltyUsers').doc('888').get()).data()!;
  check('muddati yaqinlashgan mijozga ogohlantirish', /kuyadi/.test(allText(888)) && !!u888.expiryWarnedAt && u888.balance === 20000, allText(888));
  const u889 = (await firestore.collection('loyaltyUsers').doc('889').get()).data()!;
  check('muddati o‘tgan balans kuydi', u889.balance === 0 && /сгорел/.test(allText(889)), allText(889));
  check('"sog‘indik" xabari yuborildi', /sog‘indik/.test(allText(888)) || /скучаем/.test(allText(889)));
  check('egaga kunlik hisobot', /Kecha/.test(allText(5916247309)) && cout.summary >= 1, allText(5916247309).slice(-200));
  calls.length = 0;
  await runDaily();
  check('kron ikkinchi marta qayta xabar yubormaydi (birthday/expiry/winback)', !/Tug‘ilgan kuningiz bilan/.test(allText(444)) && !/kuyadi/.test(allText(888)) && !/sog‘indik/.test(allText(888)));

  console.log('\n[16] Menyu: balans, tarix, taklif, til');
  calls.length = 0;
  await say(111, '💰 Balans');
  check('balans xabari: daraja va progress', /Balans/.test(lastText(111)) && /Kumush/.test(lastText(111)) && /▰/.test(lastText(111)), lastText(111));
  await say(111, '📜 Tarix');
  check('tarix: cashback yozuvlari', /Cashback/.test(lastText(111)) && /RCP-/.test(lastText(111)), lastText(111));
  await say(111, '👥 Do‘st taklif qilish');
  check('taklif havolasi', /t\.me\/sunduk_test_bot\?start=ref_111/.test(lastText(111)));
  await tap(111, 'lang:ru');
  const ru = (await firestore.collection('loyaltyUsers').doc('111').get()).data()!;
  check('til rus tiliga o‘zgardi', ru.lang === 'ru' && /Язык/.test(lastText(111)));
  await say(111, '💰 Баланс');
  check('rus menyusi ishlaydi', /Баланс/.test(lastText(111)) && /Серебро/.test(lastText(111)), lastText(111));
  await say(111, '/balance');
  check('/balance buyrug‘i', /Баланс/.test(lastText(111)));
  await say(111, '🎂 День рождения');
  await say(111, '31.02');
  check('noto‘g‘ri tug‘ilgan kun rad etiladi', /Неверный формат/.test(lastText(111)), lastText(111));
  await say(111, '25.03');
  check('tug‘ilgan kun saqlandi', ((await firestore.collection('loyaltyUsers').doc('111').get()).data()!).birthday === '03-25');
  await say(111, 'asdf qwer');
  check('noma’lum matn → menyu', /меню/i.test(lastText(111)));
  await say(111, code1.toLowerCase());
  check('kodni qo‘lda yuborish ishlaydi (allaqachon ishlatilgan)', /уже зачтён/.test(lastText(111)), lastText(111));

  console.log('\n[17] Bot o‘chirilgan / bloklagan');
  await firestore.collection('loyalty').doc('config').set({ enabled: false }, { merge: true });
  calls.length = 0;
  await say(999, '/start');
  check('o‘chirilganda mijozga “ishga tushmagan”', /hozircha ishga tushmagan/.test(lastText(999)), lastText(999));
  calls.length = 0;
  await hook({ message: { chat: { id: 5916247309, type: 'private' }, from: { id: 5916247309, first_name: 'Egasi' }, text: '/stat' } });
  check('admin o‘chirilganda ham ishlaydi', /Skanerlangan/.test(lastText(5916247309)));
  await firestore.collection('loyalty').doc('config').set({ enabled: true }, { merge: true });
  await hook({ my_chat_member: { chat: { id: 111, type: 'private' }, from: { id: 111 }, new_chat_member: { status: 'kicked' } } });
  check('botni bloklash belgilandi', ((await firestore.collection('loyaltyUsers').doc('111').get()).data()!).botBlocked === true);

  console.log(`\n=== Natija: ${passed} o‘tdi, ${failed} muvaffaqiyatsiz ===`);
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch(error => { console.error('TEST XATOSI:', error); server.close(); process.exit(2); });
