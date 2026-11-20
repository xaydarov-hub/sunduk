# SUNDuk

Bar va VIP karaoke xonalarini boshqarish tizimi: **7 ta xona**, vaqt bo'yicha hisob, ofitsiant / kassir / admin rollari, shot va 88 mm chek.

**Texnologiyalar:** Next.js 14 (statik sayt) · Vercel (hosting) · Firebase Auth · Firestore (real vaqt) — hammasi bepul tarifda, bank kartasi talab qilinmaydi.

## Qanday ishlaydi

- Telefon, planshet va kompyuterlar bitta bazaga ulangan: ofitsiant buyurtma qo'shsa — bar va admin darhol ko'radi.
- Xavfsizlik **serverda** (`firestore.rules`) majburlanadi. Ofitsiant brauzerni "buzib" ham buyurtmani bekor qila olmaydi, narxni o'zgartira olmaydi, to'lov qabul qila olmaydi. Bu qoidalar avtomatik testdan o'tgan.
- Pul bilan bog'liq amallar (xonani ochish, buyurtma, to'lov, bekor qilish) **tranzaksiya** bilan bajariladi: ikki qurilma bir vaqtda bir xonani ochsa yoki bir hisobni ikki marta to'lasa — faqat bittasi o'tadi.
- Vaqt telefon soatiga emas, **server vaqtiga** moslanadi.

## Rollar

| Rol | Nima qila oladi |
|---|---|
| **Ofitsiant** | Xonani ochadi (soat tanlaydi), +1 soat qo'shadi, buyurtma qo'shadi, "yetkazildi" belgilaydi, shot chiqaradi. **Bekor qila olmaydi.** |
| **Bar / Kassa** | Buyurtma navbati, to'lov qabul qilish (naqd/karta/elektron, qisman, chegirma), chek, bar savdosi. Bekor qila olmaydi. |
| **Admin** | Hammasi: xona narxlari, menyu, xodimlar, hisobotlar, **bekor qilish (sabab bilan)**, sozlamalar. |

## Hisoblash qoidasi

- Xona narxi = `belgilangan soat × soatlik narx` (narx xona ochilganda saqlanadi). Soatlik narxni admin belgilaydi.
- Vaqt tugagach 10 daqiqa bepul muddat (sozlanadi), undan keyin har boshlangan soat uchun qo'shimcha soat hisoblanadi.
- Jami = xona + taomlar − chegirma. To'langan hisob yopilganda muzlatiladi.
- Ombor buyurtma qo'shilganda kamayadi; admin bekor qilsa qaytariladi.

## Chek va shot

- 88 mm (Sozlamalarda 58 / 80 / 88), qora-oq, pastida bezak QR (skanerlanmaydi). Cheklar ichki hisob cheki — fiskal chek emas.
- Printer sozlamasi: chekkalar — yo'q, masshtab — 100%. Chrome'ni `--kiosk-printing` bilan ochsangiz, "Chop etish" dialogsiz darhol chiqadi.

---

## Ishga tushirish (bir marta)

Arxitektura: **Vercel** — sayt (frontend), **Firebase** — ma'lumotlar bazasi (Firestore) va kirish (Auth).

### 1. Firebase (baza)
1. <https://console.firebase.google.com> → **Add project** (Analytics shart emas).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** → *Production mode* → joylashuv `eur3`.
4. **Project settings → Your apps → Web** → ilovani ro'yxatdan o'tkazing va `firebaseConfig` qiymatlarini oling.
5. Qoidalar va indekslarni joylang:
   ```bash
   npx firebase login
   npx firebase use --add
   npm run deploy:rules
   ```

### 2. Vercel (sayt)
1. Kirish va loyihani bog'lash:
   ```bash
   npx vercel login
   npx vercel link
   ```
2. Muhit o'zgaruvchilarini kiriting (qiymatlar 1-qadamdagi `firebaseConfig`dan). Har biri uchun `npx vercel env add NOM production`:
   `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
3. Joylash:
   ```bash
   npm run deploy
   ```
   Sayt `https://<loyiha>.vercel.app` manzilida chiqadi.

### 3. Birinchi kirish
Saytni ochganingizda **“Birinchi sozlash”** oynasi chiqadi — bosh administrator hisobini yarating. **Buni deploydan keyin darhol o'zingiz qiling**, shundan so'ng bu oyna butunlay yopiladi. Keyin Admin → Xodimlar bo'limida ofitsiant va kassirlarga login/parol bering.

### 4. Telefonga o'rnatish
Ofitsiant telefonida saytni oching → brauzer menyusi → **“Bosh ekranga qo'shish”**. Ilova alohida (brauzer panelisiz) ochiladi.

> **Vercel Hobby (bepul) tarifi** shartlariga ko'ra faqat shaxsiy, notijorat foydalanish uchun. Bar/restoran tijorat faoliyati hisoblanadi — rasmiy ishlatish uchun Vercel Pro yoki tijoratga ruxsat beruvchi bepul hostinglar (Firebase Hosting, Cloudflare Pages) tavsiya etiladi. Loyiha ularning hammasida ishlaydi; Firebase Hosting uchun `firebase.json` tayyor: `npm run build` → `npx firebase deploy --only hosting`.

## Lokal sinov (internetsiz, Firebase emulyatori)
```bash
# Java kerak (emulyator uchun)
npm run emulators                       # bir oynada
# boshqa oynada (NEXT_PUBLIC_USE_EMULATOR=1 va demo-sunduk loyiha qiymatlari bilan):
NEXT_PUBLIC_USE_EMULATOR=1 NEXT_PUBLIC_FIREBASE_API_KEY=x NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-sunduk NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1 npm run dev
```

## Bepul tarif chegaralari (Firebase Spark)

| Resurs | Bepul chegara | 7 xonali bar uchun taxminiy sarf |
|---|---|---|
| Firestore o'qish | 50 000 / kun | ~3 000–10 000 |
| Firestore yozish | 20 000 / kun | ~200–1 000 |

Chegaradan oshsa, ilova o'sha kuni sekinlashadi/to'xtaydi (pullik tarifga o'tmasangiz, hisobingizdan pul yechilmaydi). Hisobotlarni "90 kun" rejimida tez-tez ochmang.

## Muhim eslatmalar

- **Zaxira nusxa:** Hisobotlar → **Excel (CSV)** tugmasi bilan to'lovlarni muntazam yuklab turing. Bazaning to'liq avtomatik zaxirasi pullik tarifni talab qiladi.
- **Parol unutilsa:** xodim parolini o'zi o'zgartiradi (tepadagi kalit belgisi). Unutilsa — xodimni "Faolsizlantirish" qilib, yangi login bilan hisob oching.
- **Internet uzilsa:** ilova qizil ogohlantirish chiqaradi; to'lov va buyurtma amallari aloqa tiklanguncha bajarilmaydi (ma'lumot buzilmasligi uchun).
- Qoidalarni o'zgartirsangiz: `npm run deploy:rules`.
- Narx tekshiruvi: ofitsiantning sessiya narxi xona narxiga teng bo'lishi shart (qoida). Biroq buyurtma pozitsiyalarining narxini serverda mahsulot narxi bilan solishtirib bo'lmaydi (bepul tarifda server funksiyalari yo'q) — shu sabab kunlik hisobotni (Bekor qilishlar, Faoliyat) tekshirib turing.
