// ============================================================
// SUNDUK — boshlang'ich (namuna) ma'lumotlar. Faqat birinchi sozlashda, xohlasangiz, qo'shiladi.
// Hammasini keyin Admin panelidan o'zgartirish mumkin.
// ============================================================
import { Category, Product, Room, Settings } from '@/types';

export const DEFAULT_SETTINGS: Settings = {
  businessName: 'SUNDuk',
  businessPhone: '',
  businessAddress: '',
  currency: 'UZS',
  currencySymbol: "so'm",
  taxRate: 0,
  receiptFooter: 'Tashrifingiz uchun rahmat!\nYana kutib qolamiz',
  defaultLanguage: 'uz',
  cleaningDuration: 30,
  durationOptions: [1, 2, 3, 4, 5, 6],
  overtimeBilling: true,
  overtimeGraceMinutes: 10,
  paperWidthMm: 88,
  showReceiptQr: true,
};

/** 7 ta xona. Narxlarni admin o'zgartiradi. */
export const SEED_ROOMS: Room[] = [
  { id: 'room-1', number: 'VIP 01', name: 'Premium Suite', capacity: 10, hourlyPrice: 150000, status: 'available', isActive: true },
  { id: 'room-2', number: 'VIP 02', name: 'Royal Room', capacity: 8, hourlyPrice: 120000, status: 'available', isActive: true },
  { id: 'room-3', number: 'VIP 03', name: 'Diamond Suite', capacity: 12, hourlyPrice: 200000, status: 'available', isActive: true },
  { id: 'room-4', number: 'VIP 04', name: 'Gold Room', capacity: 6, hourlyPrice: 100000, status: 'available', isActive: true },
  { id: 'room-5', number: 'VIP 05', name: 'Silver Suite', capacity: 8, hourlyPrice: 120000, status: 'available', isActive: true },
  { id: 'room-6', number: 'VIP 06', name: 'Crystal Room', capacity: 10, hourlyPrice: 150000, status: 'available', isActive: true },
  { id: 'room-7', number: 'VIP 07', name: 'Platinum Suite', capacity: 6, hourlyPrice: 100000, status: 'available', isActive: true },
];

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Ichimliklar', nameRu: 'Напитки', order: 1, isActive: true },
  { id: 'cat-2', name: 'Gazaklar', nameRu: 'Закуски', order: 2, isActive: true },
  { id: 'cat-3', name: 'Taomlar', nameRu: 'Блюда', order: 3, isActive: true },
  { id: 'cat-4', name: 'Kokteyllar', nameRu: 'Коктейли', order: 4, isActive: true },
  { id: 'cat-5', name: 'Shirinliklar', nameRu: 'Десерты', order: 5, isActive: true },
  { id: 'cat-6', name: 'Qahva', nameRu: 'Кофе', order: 6, isActive: true },
];

const p = (id: number, name: string, nameRu: string, categoryId: string, costPrice: number, salePrice: number, unit = 'dona'): Product => ({
  id: `prod-${id}`, name, nameRu, categoryId, costPrice, salePrice, unit, minStock: 0, currentStock: 0, trackStock: false, isActive: true,
});

/** Namuna menyu (narxlar taxminiy). Ombor qoldig'i yuritilmaydi — kerakli mahsulotlar uchun Mahsulotlar bo'limida yoqing. */
export const SEED_PRODUCTS: Product[] = [
  p(1, 'Heineken 0.5L', 'Хайнекен 0.5Л', 'cat-1', 12000, 25000),
  p(2, 'Carlsberg 0.5L', 'Карлсберг 0.5Л', 'cat-1', 10000, 22000),
  p(3, 'Coca-Cola 0.5L', 'Кока-Кола 0.5Л', 'cat-1', 4000, 10000),
  p(4, 'Mineral suv 0.5L', 'Минеральная вода 0.5Л', 'cat-1', 2000, 6000),
  p(5, 'Red Bull 0.25L', 'Ред Булл 0.25Л', 'cat-1', 15000, 32000),
  p(6, 'Mojito', 'Мохито', 'cat-4', 20000, 45000),
  p(7, 'Pina Colada', 'Пина Колада', 'cat-4', 25000, 55000),
  p(8, 'French Fries', 'Картофель фри', 'cat-2', 15000, 35000, 'porsiya'),
  p(9, 'Cheese Platter', 'Сырная тарелка', 'cat-2', 35000, 75000, 'porsiya'),
  p(10, 'Meat Platter', 'Мясная тарелка', 'cat-2', 55000, 120000, 'porsiya'),
  p(11, 'Burger', 'Бургер', 'cat-3', 30000, 65000),
  p(12, 'Pizza Margarita', 'Пицца Маргарита', 'cat-3', 45000, 95000),
  p(13, 'Tiramisu', 'Тирамису', 'cat-5', 25000, 55000, 'porsiya'),
  p(14, 'Espresso', 'Эспрессо', 'cat-6', 8000, 20000),
  p(15, 'Cappuccino', 'Капучино', 'cat-6', 12000, 28000),
  p(16, 'Latte', 'Латте', 'cat-6', 15000, 32000),
];
