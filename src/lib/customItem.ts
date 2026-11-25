// Menyudan tashqari qo'lda kiritiladigan pozitsiya (jarima, buzilgan buyum va h.k.) — tekshirish va tozalash.

/** Menyudan tashqari qo'lda kiritilgan pozitsiya. */
export interface CustomItemInput { name: string; price: number; quantity?: number }

export const CUSTOM_MAX_PRICE = 100_000_000;
export const CUSTOM_MAX_QUANTITY = 99;
export const CUSTOM_MAX_NAME = 60;

/** Qo'lda kiritilgan pozitsiyani tekshiradi va tozalaydi (noto'g'ri bo'lsa null). */
export function cleanCustomItem(input: CustomItemInput): { name: string; price: number; quantity: number } | null {
  const name = String(input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, CUSTOM_MAX_NAME);
  const price = Math.round(Number(input.price));
  const quantity = Math.floor(Number(input.quantity ?? 1));
  if (!name || !Number.isFinite(price) || price <= 0 || price > CUSTOM_MAX_PRICE) return null;
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > CUSTOM_MAX_QUANTITY) return null;
  return { name, price, quantity };
}
