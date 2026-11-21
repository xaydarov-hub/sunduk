// Sodiqlik (cashback) tizimi: bot funksiyalari (netlify/) va admin panel ikkalasi ishlatadigan umumiy tur va qoidalar.
// Brauzerga ham, Node'ga ham mos — hech qanday tashqi bog'liqliksiz.

export const COL = {
  config: 'loyalty',           // loyalty/config
  users: 'loyaltyUsers',
  tx: 'loyaltyTx',
  claims: 'claims',
  broadcasts: 'broadcasts',
  ads: 'ads',
  media: 'loyaltyMedia',
  redeemCodes: 'redeemCodes',
  redemptions: 'redemptions',
} as const;

export type BotLang = 'uz' | 'ru';

export interface LoyaltyTier {
  key: string;
  name: string;
  nameRu: string;
  /** Shu darajaga o'tish uchun jami xarid summasi (so'm). */
  minSpent: number;
  /** Cashback foizi. */
  percent: number;
}

export interface LoyaltyConfig {
  enabled: boolean;
  botUsername: string;
  tiers: LoyaltyTier[];
  /** QR chekdan necha soat ichida skanerlanishi kerak. */
  claimWindowHours: number;
  /** Sust kunlarni to'ldirish uchun: tanlangan hafta kunlarida qo'shimcha foiz. */
  boost: { enabled: boolean; weekdays: number[]; extraPercent: number };
  welcomeBonus: number;
  referralInviterBonus: number;
  referralInviteeBonus: number;
  /** Har tasdiqlangan chekka beriladigan omad o'yini urinishlari. */
  spinsPerReceipt: number;
  /** Zar (1–6) tushganda beriladigan bonus summalari. */
  spinPrizes: number[];
  /** Bir to'lovning necha foizigacha cashback bilan to'lash mumkin. */
  maxRedeemPercent: number;
  minRedeemAmount: number;
  /** Shuncha kun xarid qilinmasa balans kuyadi (0 — kuymaydi). */
  expiryDays: number;
  expiryWarnDays: number;
  /** Shuncha kun kelmagan mijozga "sog'indik" xabari (0 — o'chiq). */
  winbackDays: number;
  birthdayBonus: number;
  requirePhone: boolean;
  /** Majburiy obuna kanallari (@username). Bo'sh bo'lsa — talab qilinmaydi. */
  channels: string[];
  adminChatIds: string[];
  notifyLowRating: boolean;
  ratingThreshold: number;
  dailySummary: boolean;
  welcomeText: string;
  welcomeTextRu: string;
  aboutExtra: string;
  mapUrl: string;
  updatedAt?: string;
}

export const DEFAULT_LOYALTY: LoyaltyConfig = {
  enabled: false,
  botUsername: '',
  tiers: [
    { key: 'bronze', name: 'Bronza', nameRu: 'Бронза', minSpent: 0, percent: 3 },
    { key: 'silver', name: 'Kumush', nameRu: 'Серебро', minSpent: 1_500_000, percent: 4 },
    { key: 'gold', name: 'Oltin', nameRu: 'Золото', minSpent: 5_000_000, percent: 5 },
  ],
  claimWindowHours: 72,
  boost: { enabled: false, weekdays: [1, 2], extraPercent: 2 },
  welcomeBonus: 5000,
  referralInviterBonus: 10000,
  referralInviteeBonus: 5000,
  spinsPerReceipt: 1,
  spinPrizes: [500, 500, 1000, 2000, 3000, 5000],
  maxRedeemPercent: 30,
  minRedeemAmount: 1000,
  expiryDays: 90,
  expiryWarnDays: 7,
  winbackDays: 21,
  birthdayBonus: 20000,
  requirePhone: true,
  channels: [],
  adminChatIds: [],
  notifyLowRating: true,
  ratingThreshold: 3,
  dailySummary: true,
  welcomeText: '',
  welcomeTextRu: '',
  aboutExtra: '',
  mapUrl: '',
};

/** Bazadagi hujjatni standart qiymatlar bilan birlashtiradi (yangi maydonlar qo'shilganda eski hujjat buzilmasin). */
export function mergeConfig(raw: Partial<LoyaltyConfig> | undefined | null): LoyaltyConfig {
  const data = raw || {};
  const tiers = Array.isArray(data.tiers) && data.tiers.length ? [...data.tiers].sort((a, b) => a.minSpent - b.minSpent) : DEFAULT_LOYALTY.tiers;
  const prizes = Array.isArray(data.spinPrizes) && data.spinPrizes.length === 6 ? data.spinPrizes.map(n => Math.max(0, Math.round(Number(n) || 0))) : DEFAULT_LOYALTY.spinPrizes;
  return {
    ...DEFAULT_LOYALTY,
    ...data,
    tiers,
    spinPrizes: prizes,
    boost: { ...DEFAULT_LOYALTY.boost, ...(data.boost || {}) },
    channels: Array.isArray(data.channels) ? data.channels : [],
    adminChatIds: Array.isArray(data.adminChatIds) ? data.adminChatIds.map(String) : [],
  };
}

// ---------------------------------------------------------------
// Ma'lumot turlari
// ---------------------------------------------------------------
export interface LoyaltyUser {
  id: string;
  tgId: number;
  name: string;
  username?: string;
  phone?: string;
  lang: BotLang;
  balance: number;
  totalSpent: number;
  totalEarned: number;
  totalRedeemed: number;
  claims: number;
  spinTickets: number;
  tier: string;
  refBy?: string;
  refCount: number;
  birthday?: string; // "MM-DD"
  lastBirthdayYear?: number;
  state?: 'phone' | 'birthday' | '';
  pendingCode?: string;
  blocked?: boolean;
  botBlocked?: boolean;
  createdAt: string;
  lastSeenAt: string;
  lastActivityAt?: string;
  lastClaimAt?: string;
  lastWinbackAt?: string;
  expiryWarnedAt?: string;
}

export type LoyaltyTxType = 'earn' | 'welcome' | 'referral' | 'spin' | 'birthday' | 'redeem' | 'refund' | 'expire' | 'admin';

export interface LoyaltyTx {
  id: string;
  userId: string;
  type: LoyaltyTxType;
  /** Musbat — qo'shildi, manfiy — ishlatildi/kuydi. */
  amount: number;
  balanceAfter: number;
  receiptNumber?: string;
  note?: string;
  createdAt: string;
}

export interface ClaimDoc {
  code: string;
  receiptNumber: string;
  /** Cashback hisoblanadigan summa (cashback bilan to'langan qismi chiqarib tashlangan). */
  amount: number;
  paymentIds: string[];
  roomNumber?: string;
  waiterName?: string;
  cashierName?: string;
  createdAt: string;
  status: 'open' | 'claimed';
  claimedBy?: string;
  claimedAt?: string;
  cashback?: number;
  percent?: number;
  rating?: number;
}

export type BroadcastAudience =
  | { type: 'all' }
  | { type: 'tier'; tier: string }
  | { type: 'inactive'; days: number }
  | { type: 'withBalance' }
  | { type: 'noPurchase' };

export interface BroadcastDoc {
  id: string;
  text: string;
  mediaType?: 'photo' | 'video' | null;
  mediaFileId?: string;
  mediaUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  audience: BroadcastAudience;
  status: 'draft' | 'sending' | 'done' | 'failed';
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  createdAt: string;
  createdBy: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface AdDoc {
  id: string;
  title: string;
  text: string;
  mediaType?: 'photo' | 'video' | null;
  mediaFileId?: string;
  mediaUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  active: boolean;
  /** Chek tasdiqlangandan keyingi xabar oxiriga ham qo'shilsin. */
  showAfterClaim: boolean;
  startsAt?: string;
  endsAt?: string;
  order: number;
  createdAt: string;
}

export interface MediaDoc {
  id: string;
  type: 'photo' | 'video';
  fileId: string;
  caption?: string;
  createdAt: string;
}

// ---------------------------------------------------------------
// Qoidalar
// ---------------------------------------------------------------
export function tierForSpent(config: LoyaltyConfig, spent: number): LoyaltyTier {
  let current = config.tiers[0];
  for (const tier of config.tiers) if (spent >= tier.minSpent) current = tier;
  return current;
}

export function nextTier(config: LoyaltyConfig, spent: number): LoyaltyTier | null {
  return config.tiers.find(tier => tier.minSpent > spent) ?? null;
}

export function tierByKey(config: LoyaltyConfig, key: string): LoyaltyTier {
  return config.tiers.find(t => t.key === key) ?? config.tiers[0];
}

/** O'zbekiston vaqti (UTC+5, yozgi vaqt yo'q). */
export const TASHKENT_OFFSET_MS = 5 * 3600 * 1000;

export function tashkentParts(ms: number): { weekday: number; hour: number; md: string; ymd: string; year: number } {
  const d = new Date(ms + TASHKENT_OFFSET_MS);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return { weekday: d.getUTCDay(), hour: d.getUTCHours(), md: `${mm}-${dd}`, ymd: `${d.getUTCFullYear()}-${mm}-${dd}`, year: d.getUTCFullYear() };
}

/** Berilgan sana (YYYY-MM-DD, Toshkent) kunining boshi, UTC millisekundda. */
export function tashkentDayStart(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`) - TASHKENT_OFFSET_MS;
}

/** Cashback foizi: daraja foizi + (sust kun bo'lsa) qo'shimcha. */
export function cashbackPercent(config: LoyaltyConfig, spentBefore: number, atMs: number): { percent: number; base: number; boosted: boolean } {
  const base = tierForSpent(config, spentBefore).percent;
  const boosted = config.boost.enabled && config.boost.weekdays.includes(tashkentParts(atMs).weekday);
  return { percent: base + (boosted ? config.boost.extraPercent : 0), base, boosted };
}

export function calcCashback(amount: number, percent: number): number {
  return Math.max(0, Math.floor((amount * percent) / 100));
}

/** Bitta to'lovda cashback bilan to'lash mumkin bo'lgan eng katta summa. */
export function maxRedeemable(config: LoyaltyConfig, due: number, balance: number): number {
  return Math.max(0, Math.min(balance, Math.floor((due * config.maxRedeemPercent) / 100)));
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Tasodifiy (taxmin qilib bo'lmaydigan) kod. Telegram start parametriga mos: faqat harf va raqam. */
export function makeCode(length = 12): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function formatMoney(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

export function claimLink(botUsername: string, code: string): string {
  return `https://t.me/${botUsername.replace(/^@/, '')}?start=r_${code}`;
}
