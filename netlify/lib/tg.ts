// Telegram Bot API uchun yupqa qobiq. Token faqat muhit o'zgaruvchisidan olinadi va hech qachon jurnalga yozilmaydi.

export interface TgResult<T = any> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

export async function tg<T = any>(method: string, body: Record<string, unknown> = {}): Promise<TgResult<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error_code: 500, description: 'TELEGRAM_BOT_TOKEN sozlanmagan' };
  const base = process.env.TG_API_BASE || 'https://api.telegram.org';
  try {
    const res = await fetch(`${base}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as TgResult<T>;
  } catch (error) {
    return { ok: false, error_code: 0, description: error instanceof Error ? error.message.replace(token, '***') : 'tarmoq xatosi' };
  }
}

export const esc = (value: string): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function send(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
}

export interface InlineButton { text: string; callback_data?: string; url?: string; switch_inline_query?: string }
export const inline = (rows: InlineButton[][]) => ({ reply_markup: { inline_keyboard: rows } });

export function adminIds(configIds: string[]): string[] {
  const fromEnv = (process.env.TG_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([...fromEnv, ...configIds.map(String)]));
}

/** Matn + (ixtiyoriy) rasm/video + (ixtiyoriy) havola tugmasi yuboradi. Media bo'lsa matn izoh (caption) bo'ladi. */
export async function sendRich(chatId: number | string, item: { text: string; mediaType?: 'photo' | 'video' | null; mediaFileId?: string; mediaUrl?: string; buttonText?: string; buttonUrl?: string }): Promise<TgResult> {
  const markup = item.buttonText && item.buttonUrl ? inline([[{ text: item.buttonText, url: item.buttonUrl }]]) : {};
  const media = item.mediaFileId || item.mediaUrl;
  if (item.mediaType && media) {
    const method = item.mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
    const field = item.mediaType === 'video' ? 'video' : 'photo';
    const caption = item.text.length > 1000 ? item.text.slice(0, 1000) : item.text;
    const first = await tg(method, { chat_id: chatId, [field]: media, caption, parse_mode: 'HTML', ...markup });
    // Izoh juda uzun bo'lsa, qolgan qismi alohida xabar bo'lib ketadi
    if (first.ok && item.text.length > 1000) await send(chatId, item.text.slice(1000), {});
    return first;
  }
  return send(chatId, item.text || '—', markup);
}
