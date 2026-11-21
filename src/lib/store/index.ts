'use client';

// ============================================================
// SUNDUK — Global store (Zustand) + Firebase (Auth + Firestore)
//
// • Ma'lumotlar Firestore'dan real vaqtda keladi (telefonlar, kompyuter — hammasi sinxron).
// • Pul va ombor bilan bog'liq amallar TRANZAKSIYA bilan bajariladi (ikki qurilma to'qnashmaydi).
// • Ruxsatlar (masalan, bekor qilish faqat admin) Firestore qoidalarida ham majburlanadi (firestore.rules).
// ============================================================

import { create } from 'zustand';
import {
  EmailAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, reauthenticateWithCredential,
  signInWithEmailAndPassword, signOut, updatePassword,
} from 'firebase/auth';
import {
  Query, Transaction, Unsubscribe, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit,
  onSnapshot, orderBy, query, runTransaction, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import {
  User, Room, RoomSession, Order, OrderItem, Product, Category, Payment, Expense, Customer, Booking,
  InventoryMovement, Notification, ActivityLog, Settings, Language, OrderStatus, PaymentMethod, UserRole,
} from '@/types';
import { calculateCombinedBill, snapshotBill } from '@/lib/calculations';
import { formatCurrency, generateId, isStockTracked as isTracked } from '@/lib/utils';
import { nowIso, nowMs, syncClock } from '@/lib/clock';
import {
  getDb, getFirebaseAuth, getStaffCreatorAuth, isFirebaseConfigured, isValidUsername, usernameToEmail,
} from '@/lib/firebase';
import { DEFAULT_SETTINGS, SEED_CATEGORIES, SEED_PRODUCTS, SEED_ROOMS } from '@/lib/data/seed-data';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface Toast {
  id: string;
  title?: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export interface OrderRequestItem { productId: string; quantity: number }
type NewNotification = Omit<Notification, 'id' | 'createdAt' | 'isRead' | 'readBy'>;

interface AppState {
  // Holat
  configError: boolean;
  authReady: boolean;
  syncReady: boolean;
  online: boolean;
  /** Tizim birinchi marta sozlanganmi (null — hali bilinmaydi). */
  initialized: boolean | null;
  currentUser: User | null;
  isAuthenticated: boolean;
  authError: string | null;
  language: Language;
  /** Tarix qaysi sanadan boshlab yuklangan (ISO). */
  historyFrom: string | null;

  // Ma'lumotlar
  users: User[];
  rooms: Room[];
  sessions: RoomSession[];
  orders: Order[];
  products: Product[];
  categories: Category[];
  customers: Customer[];
  expenses: Expense[];
  payments: Payment[];
  notifications: Notification[];
  activityLogs: ActivityLog[];
  bookings: Booking[];
  inventoryMovements: InventoryMovement[];
  settings: Settings;
  toasts: Toast[];

  // Auth
  login: (username: string, password: string) => Promise<ActionResult>;
  logout: () => Promise<void>;
  setLanguage: (lang: Language) => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<ActionResult>;
  checkInitialized: () => Promise<void>;
  bootstrapSystem: (params: { name: string; username: string; password: string; businessName: string; seedStarter: boolean }) => Promise<ActionResult>;

  // Toast
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Xonalar
  addRoom: (room: Omit<Room, 'id'>) => Promise<ActionResult>;
  updateRoom: (roomId: string, data: Partial<Room>) => Promise<ActionResult>;
  openRoom: (params: { roomId: string; hours: number; customerName?: string; customerPhone?: string }) => Promise<ActionResult<{ session: RoomSession }>>;
  extendSession: (sessionId: string, hours?: number) => Promise<ActionResult>;
  setSessionHours: (sessionId: string, hours: number) => Promise<ActionResult>; // faqat admin
  setSessionDiscount: (sessionId: string, discount: number) => Promise<ActionResult>; // bar/admin
  cancelSession: (sessionId: string, reason: string) => Promise<ActionResult>; // faqat admin
  completeCleaning: (roomId: string) => Promise<void>;
  requestPayment: (sessionId: string) => Promise<void>;

  // Buyurtmalar
  createOrder: (params: { sessionId: string; items: OrderRequestItem[]; notes?: string }) => Promise<ActionResult<{ order: Order }>>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  cancelOrder: (orderId: string, reason: string) => Promise<ActionResult>; // faqat admin
  voidOrderItem: (orderId: string, itemId: string, reason: string) => Promise<ActionResult>; // faqat admin

  // To'lovlar
  paySession: (params: { sessionId: string; parts: Array<{ method: PaymentMethod; amount: number }>; discount?: number }) => Promise<ActionResult<{ receiptNumber: string; completed: boolean; paid: number; remaining: number }>>;
  checkoutBarSale: (params: { items: OrderRequestItem[]; method: PaymentMethod }) => Promise<ActionResult<{ order: Order; payment: Payment }>>;

  // Mahsulotlar
  addProduct: (product: Omit<Product, 'id'>) => void;
  deleteProduct: (productId: string) => void;
  deleteCategory: (categoryId: string) => Promise<ActionResult>;
  updateProduct: (productId: string, data: Partial<Product>) => void;
  addCategory: (category: Omit<Category, 'id'>) => void;
  updateCategory: (categoryId: string, data: Partial<Category>) => void;

  // Ombor
  addInventoryMovement: (params: { productId: string; type: 'in' | 'out' | 'waste'; quantity: number; reason?: string }) => Promise<ActionResult>;

  // Xarajat, mijoz, bron
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void;
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'visitCount' | 'totalSpent'>) => void;
  updateCustomer: (customerId: string, data: Partial<Customer>) => void;
  addBooking: (booking: Omit<Booking, 'id' | 'createdAt'>) => void;
  updateBooking: (bookingId: string, data: Partial<Booking>) => void;

  // Xodimlar
  addUser: (params: { name: string; username: string; phone?: string; role: UserRole; password: string }) => Promise<ActionResult>;
  updateUser: (userId: string, data: Partial<User>) => void;

  // Bildirishnomalar
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: () => void;
  addNotification: (notif: NewNotification) => void;

  // Sozlamalar va jurnal
  updateSettings: (data: Partial<Settings>) => Promise<void>;
  logActivity: (params: { userId: string; userName: string; userRole: UserRole | string; action: string; details: string; entity: string; entityId?: string }) => void;
}

// ----------------------------------------------------------------
// Yordamchilar
// ----------------------------------------------------------------
class DomainError extends Error {}

const LANG_KEY = 'sunduk-lang';
const LIVE_WINDOW_HOURS = 36;

const readLanguage = (): Language => {
  try {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LANG_KEY) : null;
    return saved === 'ru' ? 'ru' : 'uz';
  } catch { return 'uz'; }
};

const col = (name: string) => collection(getDb(), name);
const ref = (name: string, id: string) => doc(getDb(), name, id);
const newId = (name: string) => doc(col(name)).id;
const pad = (n: number, width: number) => String(n).padStart(width, '0');
const stripId = <T extends { id: string }>(value: T): Omit<T, 'id'> => { const { id: _id, ...rest } = value; void _id; return rest; };

function asDoc<T>(snap: { id: string; data: () => unknown }): T {
  return { ...(snap.data() as object), id: snap.id } as T;
}

// ----------------------------------------------------------------
// Real vaqt sinxronizatsiyasi (rolga qarab)
// ----------------------------------------------------------------
type Merged = 'orders' | 'payments' | 'sessions';
const live: Record<Merged, Array<{ id: string }>> = { orders: [], payments: [], sessions: [] };
const hist: Record<Merged, Map<string, { id: string }>> = { orders: new Map(), payments: new Map(), sessions: new Map() };
let stopSync: Unsubscribe[] = [];
let stopProfile: Unsubscribe | null = null;
let bootstrapping = false;

function publish(key: Merged) {
  const map = new Map(hist[key]);
  live[key].forEach(item => map.set(item.id, item));
  useStore.setState({ [key]: Array.from(map.values()) } as Partial<AppState>);
}

function clearData() {
  live.orders = []; live.payments = []; live.sessions = [];
  hist.orders.clear(); hist.payments.clear(); hist.sessions.clear();
  useStore.setState({
    users: [], rooms: [], sessions: [], orders: [], products: [], categories: [], customers: [], expenses: [],
    payments: [], notifications: [], activityLogs: [], bookings: [], inventoryMovements: [],
    settings: DEFAULT_SETTINGS, syncReady: false, historyFrom: null,
  });
}

function stopAllSync() {
  stopSync.forEach(unsub => unsub());
  stopSync = [];
}

function startSync(profile: User) {
  stopAllSync();
  const role = profile.role;
  const since = new Date(nowMs() - LIVE_WINDOW_HOURS * 3600 * 1000).toISOString();
  const required = new Set(['settings', 'rooms', 'categories', 'products', 'sessions', 'orders', 'notifications']);
  const markReady = (name: string) => {
    if (required.delete(name) && required.size === 0) useStore.setState({ syncReady: true });
  };
  /**
   * Obuna + qayta urinish: server qoidalari profil/ruxsat hali yetib bormagan paytda rad etishi mumkin
   * (masalan, birinchi sozlash yoki rol o'zgargan zahoti). Bunday holda bir necha marta qayta ulanamiz.
   */
  const subscribe = (name: string, attach: (ok: () => void, fail: (error: unknown) => void) => Unsubscribe, readyName = name) => {
    let attempts = 0;
    let stopped = false;
    let unsub: Unsubscribe | null = null;
    const start = () => {
      unsub = attach(
        () => { attempts = 0; markReady(readyName); },
        error => {
          console.error(`[sync:${name}]`, error);
          const code = (error as { code?: string } | null)?.code;
          if (!stopped && attempts < 3 && (code === 'permission-denied' || code === 'unavailable')) {
            attempts += 1;
            setTimeout(() => { if (!stopped) start(); }, 1500 * attempts);
          } else {
            markReady(readyName); // yuklanish aylanib qolmasin
          }
        },
      );
    };
    start();
    stopSync.push(() => { stopped = true; unsub?.(); });
  };
  const listen = <T,>(name: string, q: Query, apply: (items: T[]) => void, readyName = name) => {
    subscribe(name, (ok, fail) => onSnapshot(q, snap => { apply(snap.docs.map(d => asDoc<T>(d))); ok(); }, fail), readyName);
  };

  subscribe('settings', (ok, fail) => onSnapshot(ref('settings', 'main'), snap => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, ...(snap.exists() ? (snap.data() as Partial<Settings>) : {}) } });
    ok();
  }, fail));

  listen<Room>('rooms', col('rooms'), rooms => useStore.setState({ rooms }));
  listen<Category>('categories', col('categories'), categories => useStore.setState({ categories }));
  listen<Product>('products', col('products'), products => useStore.setState({ products }));
  listen<RoomSession>('sessions', query(col('sessions'), where('status', '==', 'active')), items => { live.sessions = items; publish('sessions'); });
  listen<Order>('orders', query(col('orders'), where('createdAt', '>=', since)), items => { live.orders = items; publish('orders'); });

  listen<Notification & { readBy?: string[] }>(
    'notifications',
    query(col('notifications'), where('targetRole', 'in', [role, 'all']), orderBy('createdAt', 'desc'), limit(30)),
    items => useStore.setState({ notifications: items.map(n => ({ ...n, isRead: (n.readBy || []).includes(profile.id) })) }),
    'notifications',
  );

  if (role === 'bar' || role === 'admin') {
    listen<Payment>('payments', query(col('payments'), where('createdAt', '>=', since)), items => { live.payments = items; publish('payments'); }, 'payments-extra');
  }
  if (role === 'admin') {
    const day90 = new Date(nowMs() - 90 * 86400 * 1000);
    const date90 = `${day90.getFullYear()}-${pad(day90.getMonth() + 1, 2)}-${pad(day90.getDate(), 2)}`;
    listen<User>('users', col('users'), users => useStore.setState({ users }), 'users-extra');
    listen<Customer>('customers', col('customers'), customers => useStore.setState({ customers }), 'customers-extra');
    listen<Booking>('bookings', col('bookings'), bookings => useStore.setState({ bookings }), 'bookings-extra');
    listen<Expense>('expenses', query(col('expenses'), where('date', '>=', date90)), expenses => useStore.setState({ expenses }), 'expenses-extra');
    listen<ActivityLog>('activityLogs', query(col('activityLogs'), orderBy('createdAt', 'desc'), limit(300)), activityLogs => useStore.setState({ activityLogs }), 'logs-extra');
    listen<InventoryMovement>('inventoryMovements', query(col('inventoryMovements'), orderBy('createdAt', 'desc'), limit(100)), inventoryMovements => useStore.setState({ inventoryMovements }), 'inv-extra');
  }
}

/** Tarixni (so'nggi N kun) bir martalik so'rov bilan yuklaydi — hisobotlar, cheklar, buyurtmalar tarixi uchun. */
export async function loadHistory(days: number): Promise<void> {
  const state = useStore.getState();
  if (!state.currentUser) return;
  const from = new Date(nowMs() - days * 86400 * 1000);
  from.setHours(0, 0, 0, 0);
  const iso = from.toISOString();
  if (state.historyFrom && state.historyFrom <= iso) return;
  const canSeePayments = state.currentUser.role === 'bar' || state.currentUser.role === 'admin';
  try {
    const [orders, sessions, payments] = await Promise.all([
      getDocs(query(col('orders'), where('createdAt', '>=', iso))),
      getDocs(query(col('sessions'), where('startTime', '>=', iso))),
      canSeePayments ? getDocs(query(col('payments'), where('createdAt', '>=', iso))) : Promise.resolve(null),
    ]);
    orders.docs.forEach(d => hist.orders.set(d.id, asDoc<Order>(d)));
    sessions.docs.forEach(d => hist.sessions.set(d.id, asDoc<RoomSession>(d)));
    payments?.docs.forEach(d => hist.payments.set(d.id, asDoc<Payment>(d)));
    publish('orders'); publish('sessions'); publish('payments');
    useStore.setState({ historyFrom: iso });
  } catch (error) {
    console.error('[history]', error);
    useStore.getState().addToast({ type: 'error', title: explain(error), message: '' });
  }
}

/** Eski chekni qayta chiqarish uchun: sessiya, uning buyurtmalari va to'lovlari. */
export async function fetchSessionBundle(sessionId: string): Promise<{ session: RoomSession; orders: Order[]; payments: Payment[] } | null> {
  const sessionSnap = await getDoc(ref('sessions', sessionId));
  if (!sessionSnap.exists()) return null;
  const [orders, payments] = await Promise.all([
    getDocs(query(col('orders'), where('sessionId', '==', sessionId))),
    getDocs(query(col('payments'), where('sessionId', '==', sessionId))),
  ]);
  return { session: asDoc<RoomSession>(sessionSnap), orders: orders.docs.map(d => asDoc<Order>(d)), payments: payments.docs.map(d => asDoc<Payment>(d)) };
}

export async function fetchOrder(orderId: string): Promise<Order | null> {
  const snap = await getDoc(ref('orders', orderId));
  return snap.exists() ? asDoc<Order>(snap) : null;
}

// ----------------------------------------------------------------
// Xatolarni foydalanuvchiga tushunarli qilish
// ----------------------------------------------------------------
const msg = (uz: string, ru: string) => (useStore.getState().language === 'uz' ? uz : ru);

function explain(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  const code = (error as { code?: string } | null)?.code || '';
  const text = String((error as Error | null)?.message || '');
  if (code === 'permission-denied' || code === 'auth/insufficient-permission') return msg('Bu amal uchun ruxsat yo‘q', 'Нет прав для этого действия');
  if (code === 'unavailable' || code === 'deadline-exceeded' || /offline|network|unavailable/i.test(text)) return msg('Internet aloqasi yo‘q — qayta urinib ko‘ring', 'Нет интернета — попробуйте ещё раз');
  if (code === 'aborted' || code === 'failed-precondition') return msg('Boshqa qurilmada o‘zgarish bo‘ldi — qayta urinib ko‘ring', 'Данные изменились на другом устройстве — повторите');
  console.error(error);
  return msg('Kutilmagan xato — qayta urinib ko‘ring', 'Непредвиденная ошибка — повторите');
}

function authError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return msg('Login yoki parol noto‘g‘ri', 'Неверный логин или пароль');
    case 'auth/too-many-requests': return msg('Juda ko‘p urinish. Bir necha daqiqadan keyin qayta urinib ko‘ring', 'Слишком много попыток. Повторите позже');
    case 'auth/network-request-failed': return msg('Internet aloqasi yo‘q', 'Нет подключения к интернету');
    case 'auth/email-already-in-use': return msg('Bunday login mavjud', 'Такой логин уже существует');
    case 'auth/weak-password': return msg('Parol kamida 6 belgi bo‘lsin', 'Пароль — минимум 6 символов');
    case 'auth/requires-recent-login': return msg('Qaytadan kiring va urinib ko‘ring', 'Войдите заново и повторите');
    default: return explain(error);
  }
}

async function run<T extends object>(fn: (tx: Transaction) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await runTransaction(getDb(), fn);
    return { ok: true as const, ...value };
  } catch (error) {
    return { ok: false as const, error: explain(error) };
  }
}

// Tranzaksiya ichida jurnal va bildirishnoma yozish
function txLog(tx: Transaction, actor: User, action: string, details: string, entity: string, entityId?: string) {
  const id = newId('activityLogs');
  const log: ActivityLog = { id, userId: actor.id, userName: actor.name, userRole: actor.role, action, details, entity, entityId, createdAt: nowIso() };
  tx.set(ref('activityLogs', id), log);
}
function txNotify(tx: Transaction, notification: NewNotification) {
  const id = newId('notifications');
  tx.set(ref('notifications', id), { ...notification, id, createdAt: nowIso(), readBy: [] });
}

const sanitizeItems = (items: OrderRequestItem[]): Map<string, number> => {
  const need = new Map<string, number>();
  items.forEach(item => {
    const quantity = Math.floor(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 99) return;
    need.set(item.productId, (need.get(item.productId) || 0) + quantity);
  });
  return need;
};

// ----------------------------------------------------------------
// Store
// ----------------------------------------------------------------
export const useStore = create<AppState>()((set, get) => {
  const fail = (uz: string, ru: string): { ok: false; error: string } => ({ ok: false, error: msg(uz, ru) });
  const requireRole = (...roles: UserRole[]): User | null => {
    const user = get().currentUser;
    return user && roles.includes(user.role) ? user : null;
  };
  const forbidden = () => fail('Bu amal uchun ruxsat yo‘q', 'Нет прав для этого действия');
  /** Natijasi kerak bo'lmagan oddiy yozuvlar: xato bo'lsa toast ko'rsatadi. */
  const write = (promise: Promise<unknown>) => {
    promise.catch(error => get().addToast({ type: 'error', title: explain(error), message: '' }));
  };

  /** Ombor qoldig'ini tranzaksiyada kamaytirish/qaytarish uchun rejalashtirish. */
  const stockWrites = (
    tx: Transaction, actor: User, products: Map<string, Product>,
    moves: Array<{ productId: string; productName: string; quantity: number }>, order: { id: string; orderNumber: string }, type: 'out' | 'return',
  ) => {
    moves.forEach(move => {
      const product = products.get(move.productId);
      if (!product || !isTracked(product)) return;
      const previousStock = product.currentStock;
      const newStock = type === 'out' ? previousStock - move.quantity : previousStock + move.quantity;
      product.currentStock = newStock; // bir mahsulot bir necha marta bo'lsa — ketma-ket hisoblanadi
      tx.update(ref('products', move.productId), { currentStock: Math.max(0, newStock) });
      const id = newId('inventoryMovements');
      const movement: InventoryMovement = {
        id, productId: move.productId, productName: move.productName, type, quantity: move.quantity, previousStock, newStock: Math.max(0, newStock),
        reason: type === 'out' ? `Buyurtma: ${order.orderNumber}` : `Bekor qilindi: ${order.orderNumber}`, reference: order.id, createdAt: nowIso(), createdBy: actor.id,
      };
      tx.set(ref('inventoryMovements', id), movement);
      if (type === 'out' && product.minStock > 0 && newStock <= product.minStock) {
        txNotify(tx, {
          title: `Kam qoldiq: ${product.name}`, titleRu: `Мало на складе: ${product.nameRu}`,
          message: `${product.name} — ${Math.max(0, newStock)} ${product.unit} qoldi (minimal: ${product.minStock})`,
          messageRu: `${product.nameRu} — осталось ${Math.max(0, newStock)} ${product.unit} (минимум: ${product.minStock})`,
          type: 'warning', targetRole: 'admin',
        });
      }
    });
  };

  const readProducts = async (tx: Transaction, ids: string[]) => {
    const snaps = await Promise.all(ids.map(id => tx.get(ref('products', id))));
    const map = new Map<string, Product>();
    snaps.forEach(snap => { if (snap.exists()) map.set(snap.id, asDoc<Product>(snap)); });
    return map;
  };

  return {
    configError: !isFirebaseConfigured,
    authReady: false,
    syncReady: false,
    online: true,
    initialized: null,
    currentUser: null,
    isAuthenticated: false,
    authError: null,
    language: 'uz' as Language,
    historyFrom: null,

    users: [], rooms: [], sessions: [], orders: [], products: [], categories: [], customers: [], expenses: [],
    payments: [], notifications: [], activityLogs: [], bookings: [], inventoryMovements: [],
    settings: DEFAULT_SETTINGS,
    toasts: [],

    // ---- Auth ----
    login: async (username, password) => {
      const name = username.trim();
      if (!name || !password) return fail('Login va parolni kiriting', 'Введите логин и пароль');
      try {
        set({ authError: null });
        await signInWithEmailAndPassword(getFirebaseAuth(), usernameToEmail(name), password);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    },
    logout: async () => {
      try { await signOut(getFirebaseAuth()); } catch (error) { console.error(error); }
    },
    setLanguage: (language) => {
      try { window.localStorage.setItem(LANG_KEY, language); } catch { /* maxfiy rejim */ }
      set({ language });
    },
    changePassword: async (oldPassword, newPassword) => {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user || !user.email) return fail('Avval tizimga kiring', 'Сначала войдите в систему');
      if (newPassword.length < 6) return fail('Yangi parol kamida 6 belgi bo‘lsin', 'Новый пароль — минимум 6 символов');
      try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, oldPassword));
        await updatePassword(user, newPassword);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    },
    checkInitialized: async () => {
      if (!isFirebaseConfigured) return;
      try {
        const snap = await getDoc(ref('meta', 'public'));
        set({ initialized: snap.exists() });
      } catch (error) {
        console.error('[initialized]', error);
        set({ initialized: null });
      }
    },
    bootstrapSystem: async ({ name, username, password, businessName, seedStarter }) => {
      if (!name.trim()) return fail('Ismingizni kiriting', 'Введите имя');
      if (!isValidUsername(username)) return fail('Login 3–30 belgi: lotin harflari, raqam, nuqta, tire', 'Логин: 3–30 символов, латиница, цифры, точка, тире');
      if (password.length < 6) return fail('Parol kamida 6 belgi bo‘lsin', 'Пароль — минимум 6 символов');
      bootstrapping = true;
      try {
        // Boshqa kimdir allaqachon sozlab qo'ygan bo'lishi mumkin
        const exists = await getDoc(ref('meta', 'public'));
        if (exists.exists()) { set({ initialized: true }); return fail('Tizim allaqachon sozlangan — tizimga kiring', 'Система уже настроена — войдите'); }
        const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), usernameToEmail(username), password);
        const uid = credential.user.uid;
        const now = nowIso();
        const batch = writeBatch(getDb());
        const profile: User = { id: uid, username: username.trim().toLowerCase(), name: name.trim(), role: 'admin', isActive: true, createdAt: now };
        batch.set(ref('users', uid), profile);
        batch.set(ref('settings', 'main'), { ...DEFAULT_SETTINGS, businessName: businessName.trim() || DEFAULT_SETTINGS.businessName });
        batch.set(ref('counters', 'main'), { order: 0, receipt: 0 });
        if (seedStarter) {
          SEED_ROOMS.forEach(room => batch.set(ref('rooms', room.id), stripId(room)));
          SEED_CATEGORIES.forEach(category => batch.set(ref('categories', category.id), stripId(category)));
          SEED_PRODUCTS.forEach(product => batch.set(ref('products', product.id), stripId(product)));
        }
        batch.set(ref('meta', 'public'), { initialized: true, createdAt: now });
        await batch.commit();
        set({ initialized: true });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authError(error) };
      } finally {
        bootstrapping = false;
      }
    },

    // ---- Toasts ----
    addToast: (toast) => {
      const id = generateId();
      set(state => ({ toasts: [...state.toasts, { ...toast, id }].slice(-4) }));
      setTimeout(() => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })), toast.duration || 4000);
    },
    removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

    // ---- Xonalar ----
    addRoom: async (room) => {
      const actor = requireRole('admin');
      if (!actor) return forbidden();
      if (!room.number.trim() || room.hourlyPrice <= 0) return fail('Raqam va soatlik narxni kiriting', 'Укажите номер и цену за час');
      if (get().rooms.some(r => r.number.trim().toLowerCase() === room.number.trim().toLowerCase())) return fail('Bunday raqamli xona mavjud', 'Комната с таким номером уже есть');
      try {
        const id = newId('rooms');
        await setDoc(ref('rooms', id), { ...room, number: room.number.trim(), name: room.name.trim(), isActive: room.isActive ?? true, status: 'available', currentSessionId: null });
        return { ok: true };
      } catch (error) { return { ok: false, error: explain(error) }; }
    },
    updateRoom: async (roomId, data) => {
      const actor = requireRole('admin');
      if (!actor) return forbidden();
      const room = get().rooms.find(r => r.id === roomId);
      if (!room) return fail('Xona topilmadi', 'Комната не найдена');
      const patch: Partial<Room> = { ...data };
      delete patch.id;
      delete patch.currentSessionId;
      if (patch.hourlyPrice !== undefined) {
        if (!Number.isFinite(patch.hourlyPrice) || patch.hourlyPrice < 0) return fail('Narx noto‘g‘ri', 'Неверная цена');
        patch.hourlyPrice = Math.round(patch.hourlyPrice);
      }
      if (patch.status && patch.status !== room.status && get().sessions.some(s => s.roomId === roomId && s.status === 'active')) {
        return fail('Xonada faol sessiya bor — avval yoping yoki bekor qiling', 'В комнате активная сессия — сначала закройте или отмените её');
      }
      try {
        await updateDoc(ref('rooms', roomId), patch as Record<string, unknown>);
        if (patch.hourlyPrice !== undefined && patch.hourlyPrice !== room.hourlyPrice) {
          get().logActivity({ userId: actor.id, userName: actor.name, userRole: actor.role, action: 'room_price_changed', details: `${room.number}: ${formatCurrency(room.hourlyPrice)} → ${formatCurrency(patch.hourlyPrice)} / soat`, entity: 'room', entityId: roomId });
        }
        return { ok: true };
      } catch (error) { return { ok: false, error: explain(error) }; }
    },
    openRoom: async ({ roomId, hours, customerName, customerPhone }) => {
      const actor = requireRole('waiter', 'admin');
      if (!actor) return forbidden();
      const bookedHours = Math.floor(hours);
      if (!Number.isFinite(bookedHours) || bookedHours < 1 || bookedHours > 24) return fail('Soat 1 dan 24 gacha bo‘lishi kerak', 'Часы должны быть от 1 до 24');
      const sessionId = newId('sessions');
      return run(async tx => {
        const roomSnap = await tx.get(ref('rooms', roomId));
        if (!roomSnap.exists()) throw new DomainError(msg('Xona topilmadi', 'Комната не найдена'));
        const room = asDoc<Room>(roomSnap);
        if (room.isActive === false) throw new DomainError(msg('Xona topilmadi', 'Комната не найдена'));
        // Boshqa ofitsiant shu xonani oldinroq ochgan bo'lsa — tranzaksiya buni ushlaydi
        if (room.status !== 'available') throw new DomainError(msg('Xona hozir bo‘sh emas (boshqa ofitsiant ochgan bo‘lishi mumkin)', 'Комната уже занята (возможно, открыл другой официант)'));
        const session: RoomSession = {
          id: sessionId, roomId, roomNumber: room.number, roomName: room.name,
          customerName: customerName?.trim() || undefined, customerPhone,
          waiterId: actor.id, waiterName: actor.name, billType: 'combined',
          startTime: nowIso(), bookedHours, hourlyPriceSnapshot: room.hourlyPrice,
          itemsTotal: 0, paidTotal: 0, status: 'active',
        };
        tx.set(ref('sessions', sessionId), session);
        tx.update(ref('rooms', roomId), { status: 'occupied', currentSessionId: sessionId });
        txLog(tx, actor, 'room_opened', `${room.number} xonasi ochildi — ${bookedHours} soat × ${formatCurrency(room.hourlyPrice)}${session.customerName ? ` (${session.customerName})` : ''}`, 'session', sessionId);
        txNotify(tx, {
          title: `${room.number} ochildi`, titleRu: `${room.number} открыта`,
          message: `${room.number}: ${bookedHours} soat. Ofitsiant: ${actor.name}`, messageRu: `${room.number}: ${bookedHours} ч. Официант: ${actor.name}`,
          type: 'info', targetRole: 'admin',
        });
        return { session };
      });
    },
    extendSession: async (sessionId, hours = 1) => {
      const actor = requireRole('waiter', 'admin');
      if (!actor) return forbidden();
      const add = Math.floor(hours);
      return run(async tx => {
        const snap = await tx.get(ref('sessions', sessionId));
        if (!snap.exists() || snap.data().status !== 'active') throw new DomainError(msg('Sessiya ochiq emas', 'Сессия не активна'));
        const session = asDoc<RoomSession>(snap);
        if (add < 1 || session.bookedHours + add > 24) throw new DomainError(msg('Soat 24 dan oshmasligi kerak', 'Не более 24 часов'));
        tx.update(ref('sessions', sessionId), { bookedHours: session.bookedHours + add });
        txLog(tx, actor, 'session_extended', `${session.roomNumber}: +${add} soat (jami ${session.bookedHours + add} soat)`, 'session', sessionId);
        return {};
      });
    },
    setSessionHours: async (sessionId, hours) => {
      const actor = requireRole('admin');
      if (!actor) return forbidden();
      const value = Math.floor(hours);
      if (!Number.isFinite(value) || value < 1 || value > 24) return fail('Soat 1 dan 24 gacha bo‘lishi kerak', 'Часы должны быть от 1 до 24');
      return run(async tx => {
        const snap = await tx.get(ref('sessions', sessionId));
        if (!snap.exists() || snap.data().status !== 'active') throw new DomainError(msg('Sessiya ochiq emas', 'Сессия не активна'));
        const session = asDoc<RoomSession>(snap);
        tx.update(ref('sessions', sessionId), { bookedHours: value });
        txLog(tx, actor, 'session_hours_changed', `${session.roomNumber}: ${session.bookedHours} → ${value} soat`, 'session', sessionId);
        return {};
      });
    },
    setSessionDiscount: async (sessionId, discount) => {
      const actor = requireRole('bar', 'admin');
      if (!actor) return forbidden();
      return run(async tx => {
        const snap = await tx.get(ref('sessions', sessionId));
        if (!snap.exists() || snap.data().status !== 'active') throw new DomainError(msg('Sessiya ochiq emas', 'Сессия не активна'));
        const session = asDoc<RoomSession>(snap);
        const bill = calculateCombinedBill(session, [], [], get().settings, { discount: 0 });
        const value = Math.min(bill.subtotal, Math.max(0, Math.round(Number.isFinite(discount) ? discount : 0)));
        tx.update(ref('sessions', sessionId), { discount: value });
        txLog(tx, actor, 'discount_set', `${session.roomNumber}: chegirma ${formatCurrency(value)}`, 'session', sessionId);
        return {};
      });
    },
    cancelSession: async (sessionId, reason) => {
      const actor = requireRole('admin');
      if (!actor) return forbidden();
      const orderIds = get().orders.filter(o => o.sessionId === sessionId && o.status !== 'cancelled').map(o => o.id);
      return run(async tx => {
        const sessionSnap = await tx.get(ref('sessions', sessionId));
        const orderSnaps = await Promise.all(orderIds.map(id => tx.get(ref('orders', id))));
        if (!sessionSnap.exists() || sessionSnap.data().status !== 'active') throw new DomainError(msg('Sessiya ochiq emas', 'Сессия не активна'));
        const session = asDoc<RoomSession>(sessionSnap);
        if ((session.paidTotal ?? 0) > 0) throw new DomainError(msg('Bu xonadan to‘lov qabul qilingan — sessiyani bekor qilib bo‘lmaydi', 'По этой сессии уже приняты платежи — отмена невозможна'));
        const orders = orderSnaps.filter(s => s.exists() && s.data()?.status !== 'cancelled').map(s => asDoc<Order>(s));
        const productIds = Array.from(new Set(orders.filter(o => o.inventoryDeducted).flatMap(o => o.items.filter(i => !i.voided).map(i => i.productId))));
        const products = await readProducts(tx, productIds);
        const now = nowIso();
        orders.forEach(order => {
          if (order.inventoryDeducted) stockWrites(tx, actor, products, order.items.filter(i => !i.voided), order, 'return');
          tx.update(ref('orders', order.id), { status: 'cancelled', cancelledAt: now, cancelledBy: actor.id, cancelReason: reason, updatedAt: now, inventoryDeducted: false });
        });
        tx.update(ref('sessions', sessionId), { status: 'cancelled', endTime: now, cancelledAt: now, cancelledBy: actor.id, cancelReason: reason, itemsTotal: 0 });
        tx.update(ref('rooms', session.roomId), { status: 'available', currentSessionId: null });
        txLog(tx, actor, 'session_cancelled', `${session.roomNumber} sessiyasi bekor qilindi. Sabab: ${reason || '—'}`, 'session', sessionId);
        return {};
      });
    },
    completeCleaning: async (roomId) => {
      if (!requireRole('waiter', 'bar', 'admin')) return;
      const room = get().rooms.find(r => r.id === roomId);
      if (room?.status !== 'cleaning') return;
      write(updateDoc(ref('rooms', roomId), { status: 'available', currentSessionId: null }));
    },
    requestPayment: async (sessionId) => {
      const actor = requireRole('waiter', 'admin');
      const session = get().sessions.find(s => s.id === sessionId);
      if (!actor || !session || session.status !== 'active') return;
      const batch = writeBatch(getDb());
      (['bar', 'admin'] as const).forEach(targetRole => {
        const id = newId('notifications');
        batch.set(ref('notifications', id), {
          id, title: 'To‘lov so‘rovi', titleRu: 'Запрос оплаты', message: `${session.roomNumber} xonasi hisobni so‘ramoqda`, messageRu: `${session.roomNumber} просит счёт`,
          type: 'warning', targetRole, reference: session.id, createdAt: nowIso(), readBy: [],
        });
      });
      const logId = newId('activityLogs');
      batch.set(ref('activityLogs', logId), { id: logId, userId: actor.id, userName: actor.name, userRole: actor.role, action: 'payment_requested', details: `${session.roomNumber}: kassaga to‘lov so‘rovi yuborildi`, entity: 'session', entityId: sessionId, createdAt: nowIso() });
      write(batch.commit());
    },

    // ---- Buyurtmalar ----
    createOrder: async ({ sessionId, items, notes }) => {
      const actor = requireRole('waiter', 'admin');
      if (!actor) return forbidden();
      const need = sanitizeItems(items);
      if (!need.size) return fail('Buyurtma bo‘sh', 'Заказ пуст');
      const orderId = newId('orders');
      return run(async tx => {
        const sessionRef = ref('sessions', sessionId);
        const sessionSnap = await tx.get(sessionRef);
        const counterSnap = await tx.get(ref('counters', 'main'));
        const products = await readProducts(tx, Array.from(need.keys()));
        if (!sessionSnap.exists() || sessionSnap.data().status !== 'active') throw new DomainError(msg('Xona sessiyasi ochiq emas', 'Сессия комнаты не активна'));
        const session = asDoc<RoomSession>(sessionSnap);

        const orderItems: OrderItem[] = [];
        for (const [productId, quantity] of Array.from(need.entries())) {
          const product = products.get(productId);
          if (!product || !product.isActive) throw new DomainError(msg('Mahsulot topilmadi yoki o‘chirilgan', 'Товар не найден или отключён'));
          if (isTracked(product) && product.currentStock < quantity) {
            throw new DomainError(msg(`"${product.name}" yetarli emas (qoldiq: ${product.currentStock} ${product.unit})`, `"${product.nameRu}" недостаточно (остаток: ${product.currentStock} ${product.unit})`));
          }
          orderItems.push({ id: generateId(), productId, productName: product.name, productNameRu: product.nameRu, quantity, unitPrice: product.salePrice, totalPrice: quantity * product.salePrice });
        }
        const total = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);
        const seq = ((counterSnap.exists() ? (counterSnap.data().order as number) : 0) || 0) + 1;
        const now = nowIso();
        const order: Order = {
          id: orderId, orderNumber: `ORD-${pad(seq, 3)}`, source: 'room', sessionId, roomId: session.roomId, roomNumber: session.roomNumber,
          waiterId: actor.id, waiterName: actor.name, items: orderItems, totalAmount: total, status: 'new',
          notes: notes?.trim() || undefined, inventoryDeducted: true, createdAt: now, updatedAt: now,
        };
        tx.set(ref('orders', orderId), order);
        tx.update(sessionRef, { itemsTotal: (session.itemsTotal ?? 0) + total });
        tx.set(ref('counters', 'main'), { order: seq }, { merge: true });
        stockWrites(tx, actor, products, orderItems, order, 'out');
        txNotify(tx, {
          title: `Yangi buyurtma: ${order.orderNumber}`, titleRu: `Новый заказ: ${order.orderNumber}`,
          message: `${session.roomNumber} xonasidan yangi buyurtma`, messageRu: `Новый заказ из комнаты ${session.roomNumber}`, type: 'info', targetRole: 'bar',
        });
        txLog(tx, actor, 'order_created', `${session.roomNumber}: ${order.orderNumber} — ${formatCurrency(total)}`, 'order', orderId);
        return { order };
      });
    },

    updateOrderStatus: async (orderId, status) => {
      const actor = get().currentUser;
      if (!actor || status === 'cancelled') return false;
      const order = get().orders.find(o => o.id === orderId);
      if (!order || order.status === 'cancelled' || order.status === 'served') return false;
      const rank: OrderStatus[] = ['new', 'accepted', 'preparing', 'ready', 'served'];
      if (rank.indexOf(status) <= rank.indexOf(order.status)) return false;
      const allowed = status === 'served' ? actor.role === 'waiter' || actor.role === 'admin' : actor.role === 'bar' || actor.role === 'admin';
      if (!allowed) return false;
      try {
        const now = nowIso();
        const batch = writeBatch(getDb());
        batch.update(ref('orders', orderId), status === 'served' ? { status, updatedAt: now, servedAt: now } : { status, updatedAt: now });
        if (status === 'ready' && order.source === 'room') {
          const id = newId('notifications');
          batch.set(ref('notifications', id), {
            id, title: `Buyurtma tayyor: ${order.roomNumber}`, titleRu: `Заказ готов: ${order.roomNumber}`,
            message: `${order.orderNumber} — ${order.roomNumber} xonasiga olib borish mumkin`, messageRu: `${order.orderNumber} — можно нести в ${order.roomNumber}`,
            type: 'success', targetRole: 'waiter', reference: order.id, createdAt: now, readBy: [],
          });
        }
        const logId = newId('activityLogs');
        batch.set(ref('activityLogs', logId), { id: logId, userId: actor.id, userName: actor.name, userRole: actor.role, action: `order_${status}`, details: `${order.orderNumber}: ${status}`, entity: 'order', entityId: orderId, createdAt: now });
        // Aloqa sekin/uzilgan bo'lsa buyurtma holati lokal saqlanadi va tarmoq tiklanganda yuboriladi
        const outcome = await Promise.race([batch.commit().then(() => 'done' as const), new Promise<'slow'>(resolve => setTimeout(() => resolve('slow'), 6000))]);
        if (outcome === 'slow') get().addToast({ type: 'warning', title: msg('Aloqa sekin — o‘zgarish tarmoq tiklanganda yuboriladi', 'Связь медленная — изменение отправится при восстановлении сети'), message: '' });
        return true;
      } catch (error) {
        get().addToast({ type: 'error', title: explain(error), message: '' });
        return false;
      }
    },

    cancelOrder: async (orderId, reason) => {
      const actor = requireRole('admin');
      if (!actor) return forbidden();
      return run(async tx => {
        const orderSnap = await tx.get(ref('orders', orderId));
        if (!orderSnap.exists()) throw new DomainError(msg('Buyurtma topilmadi', 'Заказ не найден'));
        const order = asDoc<Order>(orderSnap);
        if (order.status === 'cancelled') throw new DomainError(msg('Buyurtma allaqachon bekor qilingan', 'Заказ уже отменён'));
        if (!order.sessionId) throw new DomainError(msg('To‘langan bar savdosini bekor qilib bo‘lmaydi', 'Нельзя отменить оплаченную продажу в баре'));
        const sessionSnap = await tx.get(ref('sessions', order.sessionId));
        const session = sessionSnap.exists() ? asDoc<RoomSession>(sessionSnap) : null;
        if (!session || session.status !== 'active') throw new DomainError(msg('To‘langan yoki yopilgan hisobdagi buyurtmani o‘zgartirib bo‘lmaydi', 'Нельзя изменять заказ из оплаченного или закрытого счёта'));
        const liveItems = order.items.filter(i => !i.voided);
        const products = order.inventoryDeducted ? await readProducts(tx, Array.from(new Set(liveItems.map(i => i.productId)))) : new Map<string, Product>();
        const now = nowIso();
        if (order.inventoryDeducted) stockWrites(tx, actor, products, liveItems, order, 'return');
        tx.update(ref('orders', orderId), { status: 'cancelled', cancelledAt: now, cancelledBy: actor.id, cancelReason: reason, updatedAt: now, inventoryDeducted: false });
        tx.update(ref('sessions', session.id), { itemsTotal: Math.max(0, (session.itemsTotal ?? 0) - liveItems.reduce((sum, i) => sum + i.totalPrice, 0)) });
        txLog(tx, actor, 'order_cancelled', `${order.orderNumber} (${order.roomNumber || 'Bar'}) bekor qilindi. Sabab: ${reason || '—'}`, 'order', orderId);
        return {};
      });
    },

    voidOrderItem: async (orderId, itemId, reason) => {
      const actor = requireRole('admin');
      if (!actor) return forbidden();
      return run(async tx => {
        const orderSnap = await tx.get(ref('orders', orderId));
        if (!orderSnap.exists()) throw new DomainError(msg('Pozitsiya topilmadi', 'Позиция не найдена'));
        const order = asDoc<Order>(orderSnap);
        const item = order.items.find(i => i.id === itemId);
        if (!item) throw new DomainError(msg('Pozitsiya topilmadi', 'Позиция не найдена'));
        if (item.voided) throw new DomainError(msg('Pozitsiya allaqachon bekor qilingan', 'Позиция уже отменена'));
        if (order.status === 'cancelled') throw new DomainError(msg('Buyurtma allaqachon bekor qilingan', 'Заказ уже отменён'));
        if (!order.sessionId) throw new DomainError(msg('To‘langan bar savdosini o‘zgartirib bo‘lmaydi', 'Нельзя изменить оплаченную продажу в баре'));
        const sessionSnap = await tx.get(ref('sessions', order.sessionId));
        const session = sessionSnap.exists() ? asDoc<RoomSession>(sessionSnap) : null;
        if (!session || session.status !== 'active') throw new DomainError(msg('To‘langan yoki yopilgan hisobdagi buyurtmani o‘zgartirib bo‘lmaydi', 'Нельзя изменять заказ из оплаченного или закрытого счёта'));
        const products = order.inventoryDeducted ? await readProducts(tx, [item.productId]) : new Map<string, Product>();
        const now = nowIso();
        if (order.inventoryDeducted) stockWrites(tx, actor, products, [item], order, 'return');
        const items = order.items.map(i => (i.id === itemId ? { ...i, voided: true, voidedAt: now, voidedBy: actor.id, voidReason: reason } : i));
        const remaining = items.filter(i => !i.voided);
        const patch: Record<string, unknown> = { items, updatedAt: now, totalAmount: remaining.reduce((sum, i) => sum + i.totalPrice, 0) };
        if (!remaining.length) Object.assign(patch, { status: 'cancelled', cancelledAt: now, cancelledBy: actor.id, cancelReason: reason, inventoryDeducted: false });
        tx.update(ref('orders', orderId), patch);
        tx.update(ref('sessions', session.id), { itemsTotal: Math.max(0, (session.itemsTotal ?? 0) - item.totalPrice) });
        txLog(tx, actor, 'order_item_voided', `${order.orderNumber}: ${item.quantity} × ${item.productName} bekor qilindi. Sabab: ${reason || '—'}`, 'order', orderId);
        return {};
      });
    },

    // ---- To'lovlar ----
    paySession: async ({ sessionId, parts, discount }) => {
      const actor = requireRole('bar', 'admin');
      if (!actor) return forbidden();
      const clean = parts.map(part => ({ method: part.method, amount: Math.round(part.amount) })).filter(part => Number.isFinite(part.amount) && part.amount > 0);
      if (!clean.length) return fail('To‘lov summasini kiriting', 'Введите сумму оплаты');
      const paid = clean.reduce((sum, part) => sum + part.amount, 0);
      const orderIds = get().orders.filter(o => o.sessionId === sessionId && o.status !== 'cancelled' && o.status !== 'served').map(o => o.id);

      return run(async tx => {
        const sessionRef = ref('sessions', sessionId);
        const [sessionSnap, counterSnap, settingsSnap, ...orderSnaps] = await Promise.all([
          tx.get(sessionRef), tx.get(ref('counters', 'main')), tx.get(ref('settings', 'main')), ...orderIds.map(id => tx.get(ref('orders', id))),
        ]);
        if (!sessionSnap.exists() || sessionSnap.data().status !== 'active') throw new DomainError(msg('Sessiya ochiq emas (boshqa kassir to‘lagan bo‘lishi mumkin)', 'Сессия не активна (возможно, уже оплачена)'));
        const session = asDoc<RoomSession>(sessionSnap);
        const settings: Settings = { ...DEFAULT_SETTINGS, ...(settingsSnap.exists() ? (settingsSnap.data() as Partial<Settings>) : {}) };
        const at = nowMs();
        const createdAt = new Date(at).toISOString();
        const bill = calculateCombinedBill(session, [], [], settings, { discount: discount ?? session.discount, at });
        if (paid > bill.remaining) throw new DomainError(msg(`To‘lov qoldiqdan oshmasligi kerak (${formatCurrency(bill.remaining)})`, `Оплата не должна превышать остаток (${formatCurrency(bill.remaining)})`));

        const seq = ((counterSnap.exists() ? (counterSnap.data().receipt as number) : 0) || 0) + 1;
        const receiptNumber = `RCP-${pad(seq, 5)}`;
        clean.forEach(part => {
          const id = newId('payments');
          const payment: Payment = {
            id, sessionId, amount: part.amount, method: part.method, type: 'combined', processedBy: actor.id, processedByName: actor.name,
            roomNumber: session.roomNumber, customerName: session.customerName, createdAt, receiptNumber, billId: sessionId, status: 'confirmed',
          };
          tx.set(ref('payments', id), payment);
        });
        tx.set(ref('counters', 'main'), { receipt: seq }, { merge: true });

        const completed = paid >= bill.remaining;
        const newPaid = (session.paidTotal ?? 0) + paid;
        if (completed) {
          const closed: RoomSession = { ...session, discount: bill.discount, status: 'paid', endTime: createdAt, paidTotal: newPaid };
          const finalBill = snapshotBill(calculateCombinedBill(closed, [], [], settings, { discount: bill.discount }));
          tx.update(sessionRef, { paidTotal: newPaid, discount: bill.discount, status: 'paid', endTime: createdAt, finalBill });
          tx.update(ref('rooms', session.roomId), { status: settings.cleaningDuration > 0 ? 'cleaning' : 'available', currentSessionId: null });
          orderSnaps.forEach(snap => {
            const status = snap.exists() ? snap.data()?.status : null;
            if (snap.exists() && status !== 'served' && status !== 'cancelled') tx.update(snap.ref, { status: 'served', servedAt: createdAt, updatedAt: createdAt });
          });
        } else {
          tx.update(sessionRef, { paidTotal: newPaid, discount: bill.discount });
        }
        txLog(tx, actor, completed ? 'payment_completed' : 'payment_partial', `${session.roomNumber}: ${formatCurrency(paid)} qabul qilindi (${receiptNumber})${completed ? ' — xona yopildi' : ''}`, 'session', sessionId);
        return { receiptNumber, completed, paid, remaining: Math.max(0, bill.remaining - paid) };
      });
    },

    checkoutBarSale: async ({ items, method }) => {
      const actor = requireRole('bar', 'admin');
      if (!actor) return forbidden();
      const need = sanitizeItems(items);
      if (!need.size) return fail('Savat bo‘sh', 'Корзина пуста');
      const orderId = newId('orders');
      const paymentId = newId('payments');
      return run(async tx => {
        const counterSnap = await tx.get(ref('counters', 'main'));
        const products = await readProducts(tx, Array.from(need.keys()));
        const orderItems: OrderItem[] = [];
        for (const [productId, quantity] of Array.from(need.entries())) {
          const product = products.get(productId);
          if (!product || !product.isActive) throw new DomainError(msg('Mahsulot topilmadi yoki o‘chirilgan', 'Товар не найден или отключён'));
          if (isTracked(product) && product.currentStock < quantity) {
            throw new DomainError(msg(`"${product.name}" yetarli emas (qoldiq: ${product.currentStock} ${product.unit})`, `"${product.nameRu}" недостаточно (остаток: ${product.currentStock} ${product.unit})`));
          }
          orderItems.push({ id: generateId(), productId, productName: product.name, productNameRu: product.nameRu, quantity, unitPrice: product.salePrice, totalPrice: quantity * product.salePrice });
        }
        const total = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);
        const counter = counterSnap.exists() ? counterSnap.data() : {};
        const orderSeq = ((counter.order as number) || 0) + 1;
        const receiptSeq = ((counter.receipt as number) || 0) + 1;
        const now = nowIso();
        const order: Order = {
          id: orderId, orderNumber: `ORD-${pad(orderSeq, 3)}`, source: 'bar', barStaffId: actor.id, barStaffName: actor.name,
          items: orderItems, totalAmount: total, status: 'served', inventoryDeducted: true, createdAt: now, updatedAt: now, servedAt: now,
        };
        const payment: Payment = {
          id: paymentId, orderId, amount: total, method, type: 'bar', processedBy: actor.id, processedByName: actor.name,
          createdAt: now, receiptNumber: `RCP-${pad(receiptSeq, 5)}`, billId: orderId, status: 'confirmed',
        };
        tx.set(ref('orders', orderId), order);
        tx.set(ref('payments', paymentId), payment);
        tx.set(ref('counters', 'main'), { order: orderSeq, receipt: receiptSeq }, { merge: true });
        stockWrites(tx, actor, products, orderItems, order, 'out');
        txLog(tx, actor, 'bar_sale', `Bar savdosi ${order.orderNumber}: ${formatCurrency(total)} (${payment.receiptNumber})`, 'order', orderId);
        return { order, payment };
      });
    },

    // ---- Mahsulotlar ----
    addProduct: (product) => { if (requireRole('admin')) { const id = newId('products'); write(setDoc(ref('products', id), product)); } },
    updateProduct: (productId, data) => { if (requireRole('admin')) { const patch = { ...data }; delete (patch as Partial<Product>).id; write(updateDoc(ref('products', productId), patch)); } },
    addCategory: (category) => { if (requireRole('admin')) { const id = newId('categories'); write(setDoc(ref('categories', id), category)); } },
    deleteProduct: (productId) => { if (requireRole('admin')) write(deleteDoc(ref('products', productId))); },
    deleteCategory: async (categoryId) => {
      if (!requireRole('admin')) return forbidden();
      if (get().products.some(p => p.categoryId === categoryId)) {
        return fail('Kategoriyada mahsulotlar bor — avval ularni o‘chiring yoki boshqa kategoriyaga o‘tkazing', 'В категории есть товары — сначала удалите их или перенесите');
      }
      try { await deleteDoc(ref('categories', categoryId)); return { ok: true }; } catch (error) { return { ok: false, error: explain(error) }; }
    },
    updateCategory: (categoryId, data) => { if (requireRole('admin')) { const patch = { ...data }; delete (patch as Partial<Category>).id; write(updateDoc(ref('categories', categoryId), patch)); } },

    // ---- Ombor (qo'lda kirim/chiqim/yaroqsiz) ----
    addInventoryMovement: async ({ productId, type, quantity, reason }) => {
      const actor = requireRole('admin');
      if (!actor) return forbidden();
      if (!Number.isFinite(quantity) || quantity <= 0) return fail('Miqdorni kiriting', 'Введите количество');
      return run(async tx => {
        const snap = await tx.get(ref('products', productId));
        if (!snap.exists()) throw new DomainError(msg('Mahsulot topilmadi', 'Товар не найден'));
        const product = asDoc<Product>(snap);
        const previousStock = product.currentStock;
        const newStock = type === 'in' ? previousStock + quantity : Math.max(0, previousStock - quantity);
        tx.update(ref('products', productId), { currentStock: newStock });
        const id = newId('inventoryMovements');
        const movement: InventoryMovement = { id, productId, productName: product.name, type, quantity, previousStock, newStock, reason: reason || undefined, createdAt: nowIso(), createdBy: actor.id };
        tx.set(ref('inventoryMovements', id), movement);
        txLog(tx, actor, 'inventory_movement', `${product.name}: ${type} ${quantity} (${previousStock} → ${newStock})`, 'product', productId);
        return {};
      });
    },

    // ---- Xarajat, mijoz, bron ----
    addExpense: (expense) => { if (requireRole('admin')) { const id = newId('expenses'); write(setDoc(ref('expenses', id), { ...expense, id, createdAt: nowIso() })); } },
    addCustomer: (customer) => { if (requireRole('admin')) { const id = newId('customers'); write(setDoc(ref('customers', id), { ...customer, id, visitCount: 0, totalSpent: 0, createdAt: nowIso() })); } },
    updateCustomer: (customerId, data) => { if (requireRole('admin')) { const patch = { ...data }; delete (patch as Partial<Customer>).id; write(updateDoc(ref('customers', customerId), patch)); } },
    addBooking: (booking) => { if (requireRole('admin')) { const id = newId('bookings'); write(setDoc(ref('bookings', id), { ...booking, id, createdAt: nowIso() })); } },
    updateBooking: (bookingId, data) => { if (requireRole('admin')) { const patch = { ...data }; delete (patch as Partial<Booking>).id; write(updateDoc(ref('bookings', bookingId), patch)); } },

    // ---- Xodimlar ----
    addUser: async ({ name, username, phone, role, password }) => {
      if (!requireRole('admin')) return forbidden();
      const login = username.trim().toLowerCase();
      if (!name.trim()) return fail('Ismni kiriting', 'Введите имя');
      if (!isValidUsername(login)) return fail('Login 3–30 belgi: lotin harflari, raqam, nuqta, tire', 'Логин: 3–30 символов, латиница, цифры, точка, тире');
      if (password.length < 6) return fail('Parol kamida 6 belgi bo‘lsin', 'Пароль — минимум 6 символов');
      if (get().users.some(u => u.username.toLowerCase() === login)) return fail('Bunday login mavjud', 'Такой логин уже существует');
      try {
        const staffAuth = getStaffCreatorAuth();
        const credential = await createUserWithEmailAndPassword(staffAuth, usernameToEmail(login), password);
        const uid = credential.user.uid;
        await signOut(staffAuth);
        const profile: User = { id: uid, username: login, name: name.trim(), role, phone: phone?.trim() || undefined, isActive: true, createdAt: nowIso() };
        await setDoc(ref('users', uid), profile);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    },
    updateUser: (userId, data) => {
      if (!requireRole('admin')) return;
      const patch = { ...data };
      delete (patch as Partial<User>).id;
      write(updateDoc(ref('users', userId), patch));
    },

    // ---- Bildirishnomalar ----
    markNotificationRead: (notifId) => {
      const user = get().currentUser;
      if (!user) return;
      set(state => ({ notifications: state.notifications.map(n => (n.id === notifId ? { ...n, isRead: true } : n)) }));
      write(updateDoc(ref('notifications', notifId), { readBy: arrayUnion(user.id) }));
    },
    markAllNotificationsRead: () => {
      const user = get().currentUser;
      if (!user) return;
      const unread = get().notifications.filter(n => !n.isRead);
      if (!unread.length) return;
      set(state => ({ notifications: state.notifications.map(n => ({ ...n, isRead: true })) }));
      const batch = writeBatch(getDb());
      unread.forEach(n => batch.update(ref('notifications', n.id), { readBy: arrayUnion(user.id) }));
      write(batch.commit());
    },
    addNotification: (notif) => {
      if (!get().currentUser) return;
      const id = newId('notifications');
      write(setDoc(ref('notifications', id), { ...notif, id, createdAt: nowIso(), readBy: [] }));
    },

    // ---- Sozlamalar ----
    updateSettings: async (data) => {
      if (!requireRole('admin')) return;
      const patch: Partial<Settings> = { ...data };
      if (patch.durationOptions) {
        const options = Array.from(new Set(patch.durationOptions.map(h => Math.floor(h)).filter(h => h >= 1 && h <= 24))).sort((a, b) => a - b);
        patch.durationOptions = options.length ? options : [1, 2, 3];
      }
      if (patch.paperWidthMm !== undefined && ![58, 80, 88].includes(patch.paperWidthMm)) patch.paperWidthMm = 88;
      try { await setDoc(ref('settings', 'main'), patch, { merge: true }); } catch (error) { get().addToast({ type: 'error', title: explain(error), message: '' }); }
    },

    // ---- Faoliyat jurnali ----
    logActivity: (params) => {
      const user = get().currentUser;
      if (!user) return;
      const id = newId('activityLogs');
      // Jurnalga doim haqiqiy foydalanuvchi yoziladi (qoidalar ham shuni talab qiladi)
      const log: ActivityLog = { id, userId: user.id, userName: user.name, userRole: user.role, action: params.action, details: params.details, entity: params.entity, entityId: params.entityId, createdAt: nowIso() };
      write(setDoc(ref('activityLogs', id), log));
    },
  };
});

// ----------------------------------------------------------------
// Ishga tushirish: auth, profil, soat, tarmoq holati
// ----------------------------------------------------------------
let started = false;

export function initApp() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const set = useStore.setState;
  set({ language: readLanguage(), online: navigator.onLine });
  window.addEventListener('online', () => set({ online: true }));
  window.addEventListener('offline', () => set({ online: false }));
  if (!isFirebaseConfigured) { set({ configError: true, authReady: true }); return; }

  void syncClock();
  window.setInterval(() => { void syncClock(); }, 10 * 60 * 1000);

  onAuthStateChanged(getFirebaseAuth(), fbUser => {
    stopProfile?.();
    stopProfile = null;
    stopAllSync();
    if (!fbUser) {
      clearData();
      set({ currentUser: null, isAuthenticated: false, authReady: true });
      return;
    }
    stopProfile = onSnapshot(ref('users', fbUser.uid), { includeMetadataChanges: true }, snap => {
      if (!snap.exists()) {
        if (bootstrapping) return; // birinchi sozlash: profil hozir yoziladi
        set({ authError: 'NO_PROFILE', currentUser: null, isAuthenticated: false, authReady: true });
        void signOut(getFirebaseAuth());
        return;
      }
      // Hali serverda tasdiqlanmagan (lokal) profil bilan ma'lumot obunalarini boshlamaymiz — qoidalar rad etadi
      if (snap.metadata.hasPendingWrites) return;
      const profile = asDoc<User>(snap);
      if (!profile.isActive) {
        set({ authError: 'INACTIVE', currentUser: null, isAuthenticated: false, authReady: true });
        void signOut(getFirebaseAuth());
        return;
      }
      const previous = useStore.getState().currentUser;
      set({ currentUser: profile, isAuthenticated: true, authReady: true, authError: null });
      // Rol o'zgargan bo'lsa yoki birinchi marta — sinxronlashni qayta boshlaymiz
      if (!previous || previous.id !== profile.id || previous.role !== profile.role) startSync(profile);
    }, error => {
      console.error('[profile]', error);
      set({ authReady: true });
    });
  });
}

// Qulay hooklar
export const useCurrentUser = () => useStore(s => s.currentUser);
export const useLanguage = () => useStore(s => s.language);
export const useSettings = () => useStore(s => s.settings);
