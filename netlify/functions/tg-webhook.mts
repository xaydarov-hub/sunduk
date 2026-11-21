// Telegram webhook. Faqat maxfiy sarlavhasi (secret token) to'g'ri kelgan so'rovlar qabul qilinadi.
import { handleUpdate, markUpdate } from '../lib/bot';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('ok');
  const secret = process.env.TG_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return new Response('forbidden', { status: 403 });

  let update: any;
  try { update = await req.json(); } catch { return new Response('bad request', { status: 400 }); }

  try {
    if (typeof update?.update_id === 'number' && !(await markUpdate(update.update_id))) return new Response('dup');
    await handleUpdate(update);
  } catch (error) {
    // Telegram qayta-qayta yubormasligi uchun baribir 200 qaytaramiz
    console.error('[tg-webhook]', error instanceof Error ? error.message : 'xato');
  }
  return new Response('ok');
};
