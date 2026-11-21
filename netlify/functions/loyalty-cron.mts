// Har kuni 10:00 (Toshkent = 05:00 UTC): kunlik hisobot, tug'ilgan kun, muddat, "sog'indik".
import { runDaily } from '../lib/cron';

export default async (): Promise<Response> => {
  const result = await runDaily();
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '0 5 * * *' };
