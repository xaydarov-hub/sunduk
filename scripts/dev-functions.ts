/* Mahalliy sinov serveri: Netlify funksiyalarini (loyalty-api, tg-webhook, tg-broadcast-background, loyalty-cron) 8888-portda
 * ishga tushiradi va Telegram o'rniga soxta server (8890) ishlatadi. Firebase emulyatorlari bilan ishlaydi.
 *   npm run emulators        (alohida oynada)
 *   npm run dev:functions    (shu skript)
 * Frontend uchun: NEXT_PUBLIC_FUNCTIONS_BASE=http://127.0.0.1:8888/.netlify/functions
 */
import http from 'node:http';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT ??= 'demo-sunduk';
process.env.FB_PROJECT_ID ??= 'demo-sunduk';
process.env.TELEGRAM_BOT_TOKEN ??= 'dev-token';
process.env.TG_WEBHOOK_SECRET ??= 'dev-secret';
process.env.TG_ADMIN_IDS ??= '5916247309';
process.env.SPIN_WAIT_MS ??= '0';
process.env.BROADCAST_PAUSE_MS ??= '0';
process.env.CRON_PACE_MS ??= '0';
process.env.TG_API_BASE ??= 'http://127.0.0.1:8890';

const sent: Array<{ method: string; body: any }> = [];
const diceQueue: number[] = [];

// ---- soxta Telegram
http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => (raw += c));
  req.on('end', () => {
    const method = (req.url || '').split('/').pop() as string;
    const body = raw ? JSON.parse(raw) : {};
    sent.push({ method, body });
    res.setHeader('content-type', 'application/json');
    const ok = (result: unknown) => res.end(JSON.stringify({ ok: true, result }));
    if (method === 'getMe') return ok({ id: 999, username: 'sunduk_dev_bot' });
    if (method === 'sendDice') return ok({ message_id: 1, dice: { emoji: '🎲', value: diceQueue.shift() ?? 4 } });
    if (method === 'getChatMember') return ok({ status: 'member' });
    if (method === 'getWebhookInfo') return ok({ url: 'https://dev.local/.netlify/functions/tg-webhook', pending_update_count: 0 });
    return ok({ message_id: 1 });
  });
}).listen(8890, '127.0.0.1');

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS' };

async function main() {
  const api = (await import('../netlify/functions/loyalty-api.mts')).default;
  const webhook = (await import('../netlify/functions/tg-webhook.mts')).default;
  const broadcast = (await import('../netlify/functions/tg-broadcast-background.mts')).default;
  const { runDaily } = await import('../netlify/lib/cron');

  http.createServer(async (req, res) => {
    const url = req.url || '/';
    const done = (status: number, body: string | Buffer, headers: Record<string, string> = {}) => { res.writeHead(status, { ...CORS, ...headers }); res.end(body); };
    if (req.method === 'OPTIONS') return done(204, '');
    if (url === '/__sent') return done(200, JSON.stringify(sent), { 'content-type': 'application/json' });
    if (url === '/__reset') { sent.length = 0; return done(200, 'ok'); }
    if (url.startsWith('/__dice/')) { diceQueue.push(Number(url.split('/').pop())); return done(200, 'ok'); }
    if (url === '/__cron') return done(200, JSON.stringify(await runDaily()), { 'content-type': 'application/json' });

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const request = new Request(`http://127.0.0.1:8888${url}`, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks) });
    try {
      if (url.includes('/loyalty-api')) { const r = await api(request); return done(r.status, await r.text(), { 'content-type': 'application/json' }); }
      if (url.includes('/tg-webhook')) { const r = await webhook(request); return done(r.status, await r.text()); }
      if (url.includes('/tg-broadcast-background')) { done(202, ''); void broadcast(request); return; }
      done(404, 'not found');
    } catch (error) {
      console.error('[dev-functions]', error);
      done(500, 'error');
    }
  }).listen(8888, '127.0.0.1', () => console.log('dev-functions: http://127.0.0.1:8888 (Telegram: 8890)'));
}

main().catch(error => { console.error(error); process.exit(1); });
