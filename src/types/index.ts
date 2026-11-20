// ============================================================
// SUNDUK — Global Types
// ============================================================

export type UserRole = 'admin' | 'bar' | 'waiter';
export type Language = 'uz' | 'ru';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
}

// ============================================================
// ROOMS
// ============================================================
export type RoomStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance';
export type BillType = 'combined' | 'separate';

export interface Room {
  id: string;
  number: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  status: RoomStatus;
  description?: string;
  image?: string;
  /** false bo'lsa xona ofitsiantga ko'rinmaydi. Standart: true. */
  isActive?: boolean;
  /** Hozir ochiq turgan sessiya (band xona uchun). */
  currentSessionId?: string | null;
}

/** Xona sessiyasi yopilganda muzlatiladigan yakuniy hisob. */
export interface SessionBillSnapshot {
  billedHours: number;
  overtimeHours: number;
  roomAmount: number;
  barAmount: number;
  discount: number;
  total: number;
}

export interface RoomSession {
  id: string;
  roomId: string;
  roomNumber: string;
  roomName: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  waiterId: string;
  waiterName: string;
  billType: BillType;
  startTime: string; // ISO string
  endTime?: string; // ISO string when closed
  hourlyPriceSnapshot: number; // price at the time of opening
  /** Ofitsiant tanlagan (oldindan belgilangan) soatlar soni. */
  bookedHours: number;
  /** Kassir/admin bergan chegirma (so'mda). */
  discount?: number;
  /** Bekor qilinmagan buyurtmalar summasi (buyurtma/bekor qilishda tranzaksiya ichida yuritiladi). */
  itemsTotal?: number;
  /** Shu sessiya bo'yicha qabul qilingan jami to'lov (to'lov tranzaksiyasida yuritiladi). */
  paidTotal?: number;
  status: 'active' | 'closed' | 'paid' | 'cancelled';
  notes?: string;
  finalBill?: SessionBillSnapshot;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
}

// ============================================================
// BOOKINGS
// ============================================================
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface Booking {
  id: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  roomId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime?: string;
  status: BookingStatus;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

// ============================================================
// PRODUCTS & INVENTORY
// ============================================================
export type ProductCategory = string;

export interface Category {
  id: string;
  name: string;
  nameRu: string;
  color?: string;
  icon?: string;
  order?: number;
  isActive?: boolean;
}

export interface Product {
  id: string;
  name: string;
  nameRu: string;
  categoryId: string;
  barcode?: string;
  costPrice: number;
  salePrice: number;
  unit: string; // dona, litr, kg, etc.
  minStock: number;
  currentStock: number;
  /** true bo'lsa qoldiq yuritiladi va 0 bo'lganda sotib bo'lmaydi. */
  trackStock?: boolean;
  isActive: boolean;
  image?: string;
}

export type InventoryMovementType = 'in' | 'out' | 'waste' | 'inventory' | 'return';

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: InventoryMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  reference?: string; // order id, purchase id, etc.
  createdAt: string;
  createdBy: string;
}

// ============================================================
// PURCHASES
// ============================================================
export interface Purchase {
  id: string;
  supplierId?: string;
  supplierName: string;
  items: PurchaseItem[];
  totalAmount: number;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  status: 'pending' | 'received' | 'cancelled';
  date: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

// ============================================================
// ORDERS
// ============================================================
export type OrderStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type OrderSource = 'bar' | 'room';
export type PaymentMethod = 'cash' | 'card' | 'electronic';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productNameRu: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  /** Admin tomonidan bekor qilingan pozitsiya (hisobga kirmaydi). */
  voided?: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  source: OrderSource;
  sessionId?: string; // room session id
  roomId?: string;
  roomNumber?: string;
  waiterId?: string;
  waiterName?: string;
  barStaffId?: string;
  barStaffName?: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  servedAt?: string;
  inventoryDeducted: boolean; // prevent double deduction
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
}

// ============================================================
// PAYMENTS
// ============================================================
export interface Payment {
  id: string;
  sessionId?: string;
  orderId?: string;
  amount: number;
  method: PaymentMethod;
  type: 'room' | 'bar' | 'combined';
  paidBy?: string;
  processedBy: string;
  /** Kassir ismi (chekda ko'rsatish uchun nusxalanadi). */
  processedByName?: string;
  roomNumber?: string;
  customerName?: string;
  notes?: string;
  createdAt: string;
  receiptNumber: string;
  billId?: string;
  status?: 'confirmed' | 'pending' | 'cancelled';
  idempotencyKey?: string;
}

// ============================================================
// EXPENSES
// ============================================================
export type ExpenseCategory = 'salary' | 'utilities' | 'rent' | 'supplies' | 'maintenance' | 'marketing' | 'other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  description: string;
  paymentMethod: PaymentMethod;
  createdBy: string;
  createdAt: string;
}

// ============================================================
// CUSTOMERS
// ============================================================
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  visitCount: number;
  totalSpent: number;
  lastVisit?: string;
  createdAt: string;
}

// ============================================================
// NOTIFICATIONS & SERVICE CALLS
// ============================================================
export type ServiceCallType = 'waiter' | 'bill' | 'cleaning' | 'technical';
export type ServiceCallStatus = 'pending' | 'acknowledged' | 'resolved';

export interface ServiceCall {
  id: string;
  type: ServiceCallType;
  roomId: string;
  roomNumber: string;
  sessionId?: string;
  requestedBy: string;
  notes?: string;
  status: ServiceCallStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface Notification {
  id: string;
  title: string;
  titleRu: string;
  message: string;
  messageRu: string;
  type: 'info' | 'warning' | 'success' | 'error';
  /** Joriy foydalanuvchi uchun o'qilganmi (readBy dan hisoblanadi). */
  isRead: boolean;
  /** Kimlar o'qigan (foydalanuvchi id'lari). */
  readBy?: string[];
  targetRole: UserRole | 'all';
  createdAt: string;
  reference?: string;
}

// ============================================================
// ACTIVITY LOG
// ============================================================
export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
  entity: string;
  entityId?: string;
  createdAt: string;
}

// ============================================================
// SHIFT
// ============================================================
export interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  startTime: string;
  endTime?: string;
  startCash: number;
  endCash?: number;
  totalSales?: number;
  status: 'active' | 'closed';
  notes?: string;
}

// ============================================================
// SETTINGS
// ============================================================
export interface Settings {
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
  receiptFooter: string;
  defaultLanguage: Language;
  cleaningDuration: number; // minutes after session closes before room becomes available
  /** Ofitsiant xonani ochishda tanlaydigan soat variantlari. */
  durationOptions: number[];
  /** Belgilangan vaqtdan oshib ketganda qo'shimcha soat hisoblansinmi. */
  overtimeBilling: boolean;
  /** Qo'shimcha soat hisoblanishidan oldingi bepul daqiqalar. */
  overtimeGraceMinutes: number;
  /** Chek qog'ozi kengligi (mm): 58, 80 yoki 88. */
  paperWidthMm: number;
  /** Chek pastida QR ko'rsatilsinmi. */
  showReceiptQr: boolean;
}
