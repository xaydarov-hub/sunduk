// Admin panel va kassa uchun xavfsiz API (Firebase ID token orqali tasdiqlanadi).
//   admin:  setup, status, audienceCount, adjust, userUpdate, testBroadcast
//   kassa:  lookup, redeem, refund, confirm   (bar yoki admin)
import { authStaff, db } from '../lib/admin';
import { audienceUsers, testBroadcast } from '../lib/broadcast';
import { loadConfig } from '../lib/bot';
import {
  LoyaltyError, adjustBalance, confirmRedemption, getUser, lookupRedeem, patchUser, redeemBalance, refundRedemption,
} from '../lib/ledger';
import { adminIds, send, tg } from '../lib/tg';
import { T } from '../lib/texts';
import { COL, DEFAULT_LOYALTY, LoyaltyConfig, formatMoney } from '../../src/lib/loyalty/shared';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const MESSAGES: Record<string, string> = {
  CODE_INVALID: 'Kod noto‘g‘ri yoki topilmadi',
  CODE_USED: 'Bu kod allaqachon ishlatilgan',
  CODE_EXPIRED: 'Kod muddati tugagan (10 daqiqa) — mijoz botdan yangi kod olsin',
  NO_FUNDS: 'Mijoz balansida mablag‘ yetarli emas',
  OVER_LIMIT: 'Ruxsat etilgan foizdan oshib ketdi',
  AMOUNT_LOW: 'Summa juda kichik',
  NOT_FOUND: 'Topilmadi',
  NOT_HELD: 'Bu yozuv allaqachon yopilgan',
};

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST kerak' }, 405);
  const body = (await req.json().catch(() => null)) as Record<string, any> | null;
  const action = String(body?.action || '');
  if (!body || !action) return json({ ok: false, error: 'action kerak' }, 400);

  const adminOnly = ['setup', 'status', 'audienceCount', 'adjust', 'userUpdate', 'testBroadcast'];
  const staff = await authStaff(req, adminOnly.includes(action) ? ['admin'] : ['admin', 'bar']);
  if (!staff) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);

  try {
    const firestore = db();
    switch (action) {
      // ------------------------------------------------ admin
      case 'setup': {
        const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
        const hasSecret = !!process.env.TG_WEBHOOK_SECRET;
        if (!hasToken || !hasSecret) return json({ ok: false, error: 'Server sozlanmagan: TELEGRAM_BOT_TOKEN / TG_WEBHOOK_SECRET muhit o‘zgaruvchilari yo‘q' }, 500);
        const me = await tg('getMe');
        if (!me.ok) return json({ ok: false, error: `Bot tokeni ishlamayapti: ${me.description}` }, 502);
        const origin = new URL(req.url).origin;
        let webhook: unknown = 'o‘tkazib yuborildi';
        if (!process.env.TG_API_BASE) {
          const res = await tg('setWebhook', {
            url: `${origin}/.netlify/functions/tg-webhook`, secret_token: process.env.TG_WEBHOOK_SECRET,
            allowed_updates: ['message', 'callback_query', 'my_chat_member'], max_connections: 20,
          });
          if (!res.ok) return json({ ok: false, error: `Webhook o‘rnatilmadi: ${res.description}` }, 502);
          webhook = 'o‘rnatildi';
        }
        await tg('setMyCommands', { commands: [
          { command: 'start', description: 'Boshlash / Начать' }, { command: 'balance', description: 'Balans / Баланс' },
          { command: 'spin', description: 'Omad o‘yini / Игра удачи' }, { command: 'redeem', description: 'Cashback ishlatish / Потратить' },
          { command: 'invite', description: 'Do‘st taklif qilish / Пригласить' }, { command: 'promos', description: 'Aksiyalar / Акции' },
        ] });
        const ref = firestore.collection(COL.config).doc('config');
        const snap = await ref.get();
        const botUsername = String(me.result?.username || '');
        if (!snap.exists) await ref.set({ ...DEFAULT_LOYALTY, enabled: true, botUsername, adminChatIds: adminIds([]), updatedAt: new Date().toISOString() });
        else await ref.set({ botUsername, ...(snap.data()?.botUsername ? {} : { enabled: true }), updatedAt: new Date().toISOString() }, { merge: true });
        return json({ ok: true, botUsername, webhook });
      }

      case 'status': {
        const cfg = await loadConfig();
        const me = await tg('getMe');
        const info = await tg('getWebhookInfo');
        const channels = [];
        for (const channel of cfg.channels) {
          const chat = await tg('getChat', { chat_id: channel });
          const member = me.ok && chat.ok ? await tg('getChatMember', { chat_id: channel, user_id: me.result.id }) : null;
          channels.push({ channel, found: chat.ok, title: chat.result?.title || '', botIsAdmin: !!member?.ok && ['administrator', 'creator'].includes(member.result?.status), error: chat.ok ? undefined : chat.description });
        }
        return json({
          ok: true, botOk: me.ok, botUsername: me.result?.username || '', botError: me.ok ? undefined : me.description,
          webhookUrl: info.result?.url || '', pending: info.result?.pending_update_count ?? 0, lastError: info.result?.last_error_message || '',
          admins: adminIds(cfg.adminChatIds), channels,
          env: { token: !!process.env.TELEGRAM_BOT_TOKEN, secret: !!process.env.TG_WEBHOOK_SECRET, firebase: !!((process.env.FB_PRIVATE_KEY_B64 || process.env.FB_PRIVATE_KEY || process.env.FIRESTORE_EMULATOR_HOST) && (process.env.FB_CLIENT_EMAIL || process.env.FIRESTORE_EMULATOR_HOST)) },
        });
      }

      case 'audienceCount': {
        const users = await audienceUsers(firestore, body.audience || { type: 'all' });
        return json({ ok: true, count: users.length });
      }

      case 'adjust': {
        const amount = Math.round(Number(body.amount));
        if (!Number.isFinite(amount) || amount === 0) return json({ ok: false, error: 'Summani kiriting' }, 400);
        const note = String(body.note || '').slice(0, 120);
        const balance = await adjustBalance(firestore, String(body.userId), amount, note);
        const user = await getUser(firestore, String(body.userId));
        if (user && !user.botBlocked && amount > 0) {
          await send(user.tgId, user.lang === 'ru' ? `🎁 Администратор начислил вам <b>+${formatMoney(amount).replace("so'm", 'сум')}</b>${note ? `\n${note}` : ''}` : `🎁 Administrator hisobingizga <b>+${formatMoney(amount)}</b> qo‘shdi${note ? `\n${note}` : ''}`);
        }
        return json({ ok: true, balance });
      }

      case 'userUpdate': {
        const patch: Record<string, unknown> = {};
        if (typeof body.blocked === 'boolean') patch.blocked = body.blocked;
        if (!Object.keys(patch).length) return json({ ok: false, error: 'O‘zgarish yo‘q' }, 400);
        await patchUser(String(body.userId), patch);
        return json({ ok: true });
      }

      case 'testBroadcast': {
        const snap = await firestore.collection(COL.broadcasts).doc(String(body.id)).get();
        if (!snap.exists) return json({ ok: false, error: 'Xabar topilmadi' }, 404);
        const results = await testBroadcast(snap.data() as any);
        return json({ ok: true, results });
      }

      // ------------------------------------------------ kassa
      case 'lookup': {
        const cfg = await loadConfig();
        const code = String(body.code || '').replace(/\D/g, '');
        if (code.length !== 6) return json({ ok: false, error: 'Kod 6 xonali bo‘lishi kerak' }, 400);
        const info = await lookupRedeem(firestore, cfg, code, Math.max(0, Math.round(Number(body.due) || 0)));
        return json({ ok: true, info: { ...info, phone: info.phone ? `${info.phone.slice(0, 5)}***${info.phone.slice(-2)}` : '' } });
      }

      case 'redeem': {
        const cfg = await loadConfig();
        const code = String(body.code || '').replace(/\D/g, '');
        const res = await redeemBalance(firestore, cfg, { code, amount: Number(body.amount), due: Math.max(0, Math.round(Number(body.due) || 0)), staffId: staff.uid, staffName: staff.name });
        const user = await getUser(firestore, res.userId);
        if (user && !user.botBlocked) await send(user.tgId, T.redeemUsed(user.lang, Math.round(Number(body.amount)), res.balance));
        return json({ ok: true, id: res.id, balance: res.balance, name: res.name });
      }

      case 'refund': {
        const res = await refundRedemption(firestore, String(body.id));
        return json({ ok: true, balance: res.balance });
      }

      case 'confirm': {
        await confirmRedemption(firestore, String(body.id), String(body.receiptNumber || ''));
        return json({ ok: true });
      }

      default:
        return json({ ok: false, error: 'Noma’lum amal' }, 400);
    }
  } catch (error) {
    if (error instanceof LoyaltyError) return json({ ok: false, error: MESSAGES[error.code] || error.code, code: error.code }, 400);
    console.error('[loyalty-api]', action, error instanceof Error ? error.message : 'xato');
    return json({ ok: false, error: 'Server xatosi' }, 500);
  }
};

export type { LoyaltyConfig };
