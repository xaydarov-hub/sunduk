// Ommaviy xabar yuborish — fon funksiyasi (15 daqiqagacha ishlay oladi). Faqat admin chaqira oladi.
import { authStaff } from '../lib/admin';
import { runBroadcast } from '../lib/broadcast';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('POST kerak', { status: 405 });
  const staff = await authStaff(req, ['admin']);
  if (!staff) return new Response('ruxsat yo‘q', { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return new Response('id kerak', { status: 400 });
  await runBroadcast(body.id);
  return new Response('ok');
};
