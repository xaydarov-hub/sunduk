/* Hisob-kitob yadrosini tekshiradi: xizmat haqi, aksiya (eski narx) tejamkorligi, muzlatilgan hisob, menyudan tashqari pozitsiya.
 *   npx tsx scripts/bill-test.ts      (emulator kerak emas)
 */
import { calculateCombinedBill, calculateService, lineSavings, sessionBillLines, snapshotBill } from '../src/lib/calculations';
import { cleanCustomItem } from '../src/lib/customItem';
import type { Order, RoomSession } from '../src/types';

let passed = 0; let failed = 0;
const check = (name: string, cond: boolean, extra?: unknown) => { if (cond) { passed += 1; console.log(`  ✓ ${name}`); } else { failed += 1; console.log(`  ✗ ${name}`, extra ?? ''); } };
const eq = (name: string, actual: unknown, expected: unknown) => check(`${name} (${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected), `kutilgan: ${JSON.stringify(expected)}`);

// 2 soat × 100 000 = 200 000, 1 soat oldin boshlangan va hali vaqt tugamagan
const START = new Date('2026-01-01T10:00:00Z').getTime();
const AT = START + 30 * 60 * 1000;
const session = (over: Partial<RoomSession> = {}): RoomSession => ({
  id: 'S1', roomId: 'r1', roomNumber: 'VIP 01', roomName: 'Room', waiterId: 'w', waiterName: 'W', billType: 'hourly' as RoomSession['billType'],
  startTime: new Date(START).toISOString(), hourlyPriceSnapshot: 100000, bookedHours: 2, itemsTotal: 100000, paidTotal: 0, status: 'active', ...over,
});
const billing = (rate: number, base: 'all' | 'items' = 'all') => ({ overtimeBilling: true, overtimeGraceMinutes: 10, serviceRate: rate, serviceBase: base });

console.log('\n[xizmat haqi]');
let bill = calculateCombinedBill(session(), [], [], billing(10), { at: AT });
eq('xona 200 000 + taom 100 000, 10% xizmat → 30 000', [bill.roomAmount, bill.barAmount, bill.subtotal, bill.service, bill.serviceRate, bill.total], [200000, 100000, 300000, 30000, 10, 330000]);
bill = calculateCombinedBill(session(), [], [], billing(10), { at: AT, discount: 30000 });
eq('chegirmadan keyingi summadan hisoblanadi: (300 000 − 30 000) × 10%', [bill.discount, bill.service, bill.total], [30000, 27000, 297000]);
bill = calculateCombinedBill(session(), [], [], billing(10, 'items'), { at: AT, discount: 30000 });
eq('faqat taomlardan: 100 000 × (270/300) × 10% = 9 000', [bill.service, bill.total], [9000, 279000]);
bill = calculateCombinedBill(session(), [], [], billing(0), { at: AT });
eq('0% — xizmat haqi yo‘q', [bill.service, bill.total], [0, 300000]);
bill = calculateCombinedBill(session(), [], [], { overtimeBilling: true, overtimeGraceMinutes: 10 }, { at: AT });
eq('sozlama berilmasa — xizmat haqi yo‘q', [bill.service, bill.total], [0, 300000]);
eq('yaxlitlash: 33 333 × 10% → 3 333', calculateService({ roomAmount: 0, barAmount: 33333, discount: 0 }, billing(10)).amount, 3333);
eq('bo‘sh hisobda xizmat haqi 0', calculateService({ roomAmount: 0, barAmount: 0, discount: 0 }, billing(10)).amount, 0);
eq('foiz 100 dan oshsa 100 ga qisiladi', calculateService({ roomAmount: 1000, barAmount: 0, discount: 0 }, billing(500)).amount, 1000);
eq('manfiy foiz — 0', calculateService({ roomAmount: 1000, barAmount: 0, discount: 0 }, billing(-5)).amount, 0);
bill = calculateCombinedBill(session({ discount: 500000 }), [], [], billing(10), { at: AT });
eq('chegirma jamidan oshsa — jami 0 va xizmat haqi 0', [bill.discount, bill.service, bill.total], [300000, 0, 0]);

console.log('\n[muzlatilgan hisob]');
const open = calculateCombinedBill(session(), [], [], billing(10), { at: AT });
const snap = snapshotBill(open);
eq('snapshot xizmat haqi va foizini saqlaydi', [snap.service, snap.serviceRate, snap.total], [30000, 10, 330000]);
const closed = calculateCombinedBill(session({ status: 'paid', finalBill: snap, paidTotal: 330000, endTime: new Date(AT).toISOString() }), [], [], billing(25), { at: AT + 86400000 });
eq('keyin foiz o‘zgarsa ham yopilgan hisob o‘zgarmaydi', [closed.service, closed.serviceRate, closed.total, closed.remaining], [30000, 10, 330000, 0]);
const legacy = calculateCombinedBill(session({ status: 'paid', finalBill: { billedHours: 2, overtimeHours: 0, roomAmount: 200000, barAmount: 100000, discount: 0, total: 300000 }, paidTotal: 300000 }), [], [], billing(10), { at: AT });
eq('eski (xizmat haqisiz) yopilgan hisob buzilmaydi', [legacy.service, legacy.total, legacy.remaining], [0, 300000, 0]);
const partial = calculateCombinedBill(session({ paidTotal: 100000 }), [], [], billing(10), { at: AT });
eq('qisman to‘lovda qoldiq xizmat haqini ham o‘z ichiga oladi', [partial.total, partial.totalPaid, partial.remaining], [330000, 100000, 230000]);

console.log('\n[aksiya: eski narx]');
const order = (items: Order['items'], over: Partial<Order> = {}): Order => ({
  id: `o${Math.random()}`, orderNumber: 'ORD-1', source: 'room', sessionId: 'S1', items, totalAmount: items.reduce((s, i) => s + i.totalPrice, 0), status: 'served',
  createdAt: '', updatedAt: '', inventoryDeducted: true, ...over,
});
const item = (id: string, productId: string, qty: number, unit: number, extra: Partial<Order['items'][number]> = {}) => ({ id, productId, productName: productId, productNameRu: productId, quantity: qty, unitPrice: unit, totalPrice: qty * unit, ...extra });
const lines = sessionBillLines('S1', [
  order([item('1', 'fanta', 2, 20000, { oldUnitPrice: 25000 }), item('2', 'cola', 1, 20000, { oldUnitPrice: 25000 })]),
  order([item('3', 'fanta', 1, 20000, { oldUnitPrice: 25000 })]),        // bir xil mahsulot, bir xil eski narx → yig‘iladi
  order([item('4', 'fanta', 1, 20000, { oldUnitPrice: 30000 })]),        // eski narx boshqa → alohida qator
  order([item('5', 'fanta', 1, 20000)]),                                  // aksiyasiz → alohida
  order([item('6', 'x', 1, 10000, { oldUnitPrice: 10000 })]),             // eski = yangi → aksiya hisoblanmaydi
]);
eq('qatorlar soni (eski narx farqi alohida)', lines.length, 5);
const fantaPromo = lines.find(l => l.productId === 'fanta' && l.oldUnitPrice === 25000)!;
eq('bir xil eski narxli pozitsiyalar yig‘iladi: 3 dona, jami 60 000', [fantaPromo.quantity, fantaPromo.total], [3, 60000]);
eq('aksiya tejamkorligi qator bo‘yicha: 3 × (25 000 − 20 000)', lineSavings(fantaPromo), 15000);
eq('eski narx = yangi narx bo‘lsa eski narx saqlanmaydi', lines.find(l => l.productId === 'x')!.oldUnitPrice, undefined);
const withPromo = calculateCombinedBill(session({ itemsTotal: 0 }), [order([item('1', 'fanta', 2, 20000, { oldUnitPrice: 25000 })])], [], billing(0), { at: AT });
eq('hisobdagi promoSavings = 10 000 va jamiga ta’sir qilmaydi (itemsTotal manbadan)', [withPromo.promoSavings, withPromo.barAmount], [10000, 0]);
const voided = sessionBillLines('S1', [order([item('1', 'fanta', 2, 20000, { oldUnitPrice: 25000, voided: true })])]);
eq('bekor qilingan pozitsiya hisobga kirmaydi', voided.length, 0);

console.log('\n[menyudan tashqari pozitsiya]');
const customLines = sessionBillLines('S1', [order([
  item('a', 'custom:a', 1, 50000, { custom: true, productName: 'Jarima' }),
  item('b', 'custom:b', 1, 50000, { custom: true, productName: 'Buzilgan stakan' }),
], { inventoryDeducted: false, customOnly: true })]);
eq('narxi bir xil, nomi boshqa custom pozitsiyalar qo‘shilib ketmaydi', customLines.map(l => l.name), ['Jarima', 'Buzilgan stakan']);
check('custom belgisi saqlanadi', customLines.every(l => l.custom === true));
eq('toza nom/narx/soni', cleanCustomItem({ name: '  Jarima   —  stakan ', price: 50000.4, quantity: 2 }), { name: 'Jarima — stakan', price: 50000, quantity: 2 });
eq('soni berilmasa 1', cleanCustomItem({ name: 'Jarima', price: 1000 })?.quantity, 1);
eq('bo‘sh nom rad etiladi', cleanCustomItem({ name: '   ', price: 1000 }), null);
eq('narx 0 rad etiladi', cleanCustomItem({ name: 'x', price: 0 }), null);
eq('manfiy narx rad etiladi', cleanCustomItem({ name: 'x', price: -5 }), null);
eq('NaN narx rad etiladi', cleanCustomItem({ name: 'x', price: Number.NaN }), null);
eq('juda katta narx rad etiladi', cleanCustomItem({ name: 'x', price: 100_000_001 }), null);
eq('soni 0 yoki 100 rad etiladi', [cleanCustomItem({ name: 'x', price: 1, quantity: 0 }), cleanCustomItem({ name: 'x', price: 1, quantity: 100 })], [null, null]);
eq('uzun nom 60 belgiga qisqartiriladi', cleanCustomItem({ name: 'a'.repeat(100), price: 1 })?.name.length, 60);

console.log(`\n=== Hisob-kitob natijasi: ${passed} o‘tdi, ${failed} muvaffaqiyatsiz ===`);
process.exit(failed ? 1 : 0);
