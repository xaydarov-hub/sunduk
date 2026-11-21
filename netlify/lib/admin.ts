import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

// Server (Netlify Functions) tomonidagi Firebase Admin. Kalit faqat Netlify muhit o'zgaruvchilarida saqlanadi:
//   FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY
// Mahalliy sinov uchun: FIRESTORE_EMULATOR_HOST (+ FIREBASE_AUTH_EMULATOR_HOST) berilsa, kalit talab qilinmaydi.

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FB_PROJECT_ID || process.env.GCLOUD_PROJECT || 'demo-sunduk';
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId });
  // Kalit base64 ko'rinishida (FB_PRIVATE_KEY_B64 — tavsiya etiladi) yoki oddiy matn sifatida berilishi mumkin
  const b64 = process.env.FB_PRIVATE_KEY_B64;
  const privateKey = b64 ? Buffer.from(b64, 'base64').toString('utf8') : (process.env.FB_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const clientEmail = process.env.FB_CLIENT_EMAIL || '';
  if (!privateKey || !clientEmail) throw new Error('Firebase Admin kaliti sozlanmagan (FB_CLIENT_EMAIL / FB_PRIVATE_KEY_B64)');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
}

let configured = false;
export function db(): Firestore {
  const firestore = getFirestore(app());
  if (!configured) {
    configured = true;
    try { firestore.settings({ ignoreUndefinedProperties: true }); } catch { /* allaqachon sozlangan */ }
  }
  return firestore;
}

export const adminAuth = () => getAuth(app());

export interface Staff { uid: string; role: 'admin' | 'bar' | 'waiter'; name: string }

/** Authorization: Bearer <Firebase ID token> ni tekshiradi va xodim rolini bazadan oladi. */
export async function authStaff(req: Request, allowed: Array<Staff['role']>): Promise<Staff | null> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const snap = await db().collection('users').doc(decoded.uid).get();
    const data = snap.data();
    if (!snap.exists || !data || data.isActive !== true || !allowed.includes(data.role)) return null;
    return { uid: decoded.uid, role: data.role, name: String(data.name || '') };
  } catch {
    return null;
  }
}
