// Server vaqtiga moslangan soat.
// Xonalar vaqt bo'yicha hisoblanadi, shuning uchun telefon/kompyuter soati noto'g'ri bo'lsa ham
// barcha qurilmalar bir xil vaqtni ko'rishi kerak. Server vaqtini o'z sayt javobining `Date` sarlavhasidan olamiz.

let offsetMs = 0;
let synced = false;

/** Server vaqtiga tuzatilgan hozirgi vaqt (ms). */
export const nowMs = (): number => Date.now() + offsetMs;
export const nowIso = (): string => new Date(nowMs()).toISOString();
/** Qurilma soati serverdan qancha farq qiladi (ms). */
export const clockOffsetMs = (): number => offsetMs;
export const isClockSynced = (): boolean => synced;

export async function syncClock(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const t0 = Date.now();
    const response = await fetch(`${window.location.origin}/?_t=${t0}`, { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();
    const header = response.headers.get('date');
    if (!header) return;
    const server = Date.parse(header);
    if (!Number.isFinite(server)) return;
    // `Date` sarlavhasi 1 soniya aniqlikda: o'rtacha +0.5s deb olamiz, so'rov kechikishini o'rtalashtiramiz
    offsetMs = server + 500 - (t0 + t1) / 2;
    synced = true;
  } catch {
    /* internet yo'q — qurilma soatidan foydalanamiz */
  }
}
