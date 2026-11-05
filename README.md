[README.md](https://github.com/user-attachments/files/34434120/README.md)
# PaxtaGram GAME HUB

## Stack
Node.js + Express + Socket.IO + better-sqlite3 + chess.js + Vanilla HTML/CSS/JS.

## Ishga tushirish
1. Node.js 20+ o‘rnating.
2. Papkada terminal oching: `npm install`
3. `.env.example` faylini `.env` nomiga nusxalang.
4. `.env` ichida `BOT_TOKEN`, `WEBAPP_URL`, `ADMIN_IDS` qiymatlarini kiriting.
5. `npm start` buyrug‘ini bajaring.
6. Hosting domenini PaxtaGram botidagi WebApp tugmasiga ulang.

## Muhim
- `BOT_TOKEN` — PaxtaGram bot tokeni.
- `WEBAPP_URL` — HTTPS bilan boshlanuvchi mini-app manzili.
- `ADMIN_IDS` — admin PaxtaGram user ID raqamlari, vergul bilan ajrating.
- Test uchun `.env` ga `ALLOW_PREVIEW=true` qo‘shib, saytni `/?preview=1` bilan ochish mumkin. Ommaviy hostingda preview rejimini o‘chiring.
- Coinlar virtual o‘yin ballari. Haqiqiy pul tikish yoki yechib olish yo‘q.

## Hozirgi MVP chegaralari
- Online shaxmat yurishlari serverda `chess.js` orqali tekshiriladi.
- Online bilyard uchun hozirgi interfeys va navbat almashish demo darajasida; to‘liq sinxron fizika, sharlarni cho‘ntakka tushirish va g‘olibni aniqlashni keyingi bosqichda server-authoritative qilib tugatish kerak.
- Botga qarshi shaxmat hozir demo interfeys; to‘liq qoidali AI raqib hali ulanmagan.
- Snake hozir brauzerda ishlaydigan mini-o‘yin. Uning coin mukofotini serverda tekshirish va natijani saqlash keyingi bosqichda qo‘shilishi kerak.
- Admin va foydalanuvchi amallari imzolangan PaxtaGram initData orqali tekshiriladi. PaxtaGram SDK/API imzo formati sizdagi hujjat bilan mosligini test qiling.
- Stars donat `createInvoiceLink` va `successful_payment` oqimidan foydalanadi. PaxtaGram hisobingizda Stars invoice qo‘llab-quvvatlanishini tekshiring.
