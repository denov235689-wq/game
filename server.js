require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

// ===== Kod ichiga yozilgan sozlamalar (env bo'lsa, env ustun turadi) =====
const HARDCODED_TOKEN = "1762:4uh133daMTq_ubH5nKS8e4xMvcyRRAbM3e7";
const HARDCODED_ADMIN_IDS = ["92"];
const HARDCODED_WEBAPP_URL = "https://paxta.online";

// ===== Doimiy saqlash: baza fayli qayta ishga tushirishda o'chib ketmasligi uchun =====
// Ustuvorlik: DB_PATH env -> /data (persistent volume) -> ./data papkasi
function resolveDbPath(){
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const dir = fs.existsSync("/data") ? "/data" : path.join(__dirname, "data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "gamehub.sqlite");
}
const DB_PATH = resolveDbPath();
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
console.log("SQLite fayli:", DB_PATH);

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.BOT_TOKEN || HARDCODED_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || HARDCODED_WEBAPP_URL;
const ADMIN_IDS = [...new Set([
  ...HARDCODED_ADMIN_IDS,
  ...(process.env.ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean)
])];
const DONATION_USERNAME = process.env.DONATION_USERNAME || "";

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, coins INTEGER NOT NULL DEFAULT 500,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP, blocked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS games(
 id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, player1 TEXT, player2 TEXT,
 stake INTEGER DEFAULT 0, winner TEXT, status TEXT DEFAULT 'waiting',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS donations(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER,
 currency TEXT DEFAULT 'XTR', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);
const defaults = { chess_price: "20", billiards_price: "20", snake_price: "10", enabled_chess: "1", enabled_billiards: "1", enabled_snake: "1" };
for (const [k,v] of Object.entries(defaults)) db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").run(k,v);

const getUser = db.prepare("SELECT * FROM users WHERE id=?");
const setting = db.prepare("SELECT value FROM settings WHERE key=?");
const readSettings = () => Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x => [x.key,x.value]));
const isAdmin = id => ADMIN_IDS.includes(String(id));
function userSafe(u){ return {id:u.id,name:u.name,coins:u.coins,admin:isAdmin(u.id)}; }
function upsertUser(id,name){
  id=String(id);
  db.prepare("INSERT INTO users(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name").run(id,String(name||"Player").slice(0,50));
  return getUser.get(id);
}
function charge(id, amount){
  const u=getUser.get(String(id));
  if(!u || u.blocked || u.coins < amount) return false;
  return db.prepare("UPDATE users SET coins=coins-? WHERE id=? AND coins>=?").run(amount,String(id),amount).changes===1;
}
function reward(id, amount){ db.prepare("UPDATE users SET coins=coins+? WHERE id=?").run(amount,String(id)); }
function botApi(method, body){
  if(!TOKEN) return Promise.resolve(null);
  return fetch(`https://paxta.online/bot${TOKEN}/${method}`, {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)
  }).then(r=>r.json()).catch(()=>null);
}

// PaxtaGram initData HMAC verification (Telegram-compatible WebApp signature).
const crypto = require("crypto");
function verifyInitData(raw){
  if(!TOKEN || !raw) return null;
  try{
    const p=new URLSearchParams(raw);
    const hash=p.get("hash"); if(!hash) return null;
    p.delete("hash");
    const data=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
    const secret=crypto.createHmac("sha256","WebAppData").update(TOKEN).digest();
    const calc=crypto.createHmac("sha256",secret).update(data).digest("hex");
    if(!crypto.timingSafeEqual(Buffer.from(hash,"hex"),Buffer.from(calc,"hex"))) return null;
    const authDate=Number(p.get("auth_date")||0);
    if(!authDate || Date.now()/1000-authDate>86400) return null;
    return JSON.parse(p.get("user")||"{}");
  }catch{return null;}
}
function authenticatedUser(req){
  return verifyInitData(req.headers["x-paxtagram-initdata"] || "");
}
function requireSignedUser(req,res,next){
  const tg=authenticatedUser(req);
  if(!tg?.id) return res.status(401).json({error:"PaxtaGram sessiyasi tasdiqlanmadi"});
  req.tgUser=tg; next();
}
app.use(express.json());
app.use(express.static("public"));
app.get("/api/config",(req,res)=>res.json({donationUsername:DONATION_USERNAME,settings:readSettings()}));
app.post("/api/auth",(req,res)=>{
  const tg=verifyInitData(req.body.initData||"");
  // Local preview fallback. Disable this fallback on public production deployments.
  const preview=process.env.ALLOW_PREVIEW==="true" && req.body.previewId;
  if(!tg && !preview) return res.status(401).json({error:"PaxtaGram sessiyasi tasdiqlanmadi"});
  const id=String(tg?.id || req.body.previewId);
  const name=tg?.first_name || req.body.previewName || "Player";
  const u=upsertUser(id,name);
  if(u.blocked) return res.status(403).json({error:"Hisob bloklangan"});
  res.json({user:userSafe(u),settings:readSettings()});
});
app.get("/api/leaderboard",(req,res)=>{
  res.json(db.prepare("SELECT name,coins FROM users WHERE blocked=0 ORDER BY coins DESC LIMIT 10").all());
});
app.post("/api/donate",requireSignedUser,(req,res)=>{
  const amount=Number(req.body.amount);
  const userId=String(req.body.userId||"");
  if(String(req.tgUser.id)!==userId || !getUser.get(userId) || ![10,25,50,100,250].includes(amount)) return res.status(400).json({error:"Noto‘g‘ri summa"});
  if(!TOKEN) return res.status(503).json({error:"Bot token sozlanmagan"});
  botApi("createInvoiceLink",{
    title:"GAME HUB rivoji uchun donat",
    description:"GAME HUB loyihasini ixtiyoriy qo‘llab-quvvatlash",
    payload:`donate_${userId}_${Date.now()}`,
    currency:"XTR", prices:[{label:`${amount} Stars donat`,amount}]
  }).then(data=>{
    const url=data?.result;
    if(!url) return res.status(502).json({error:"Invoice yaratilmadi"});
    res.json({url});
  });
});

// PaxtaGram bot long polling.
let offset=0, polling=false;
async function pollBot(){
  if(polling || !TOKEN) return; polling=true;
  while(true){
    try{
      const r=await botApi("getUpdates",{offset,timeout:25});
      for(const upd of (r?.result||[])){
        offset=upd.update_id+1;
        const msg=upd.message;
        if(msg?.successful_payment){
          const p=msg.successful_payment;
          const payload=p.invoice_payload||"";
          const m=payload.match(/^donate_(\d+)_/);
          if(m) db.prepare("INSERT INTO donations(user_id,amount,currency) VALUES(?,?,?)").run(m[1],p.total_amount,p.currency||"XTR");
          botApi("sendMessage",{chat_id:msg.chat.id,text:"❤️ Donatingiz uchun katta rahmat! GAME HUB rivojiga hissa qo‘shdingiz."});
        } else if(msg?.text==="/start"){
          botApi("sendMessage",{chat_id:msg.chat.id,text:"🎮 GAME HUB ga xush kelibsiz! O‘yinlarni ochish uchun tugmani bosing.",reply_markup:{inline_keyboard:[[{text:"🎮 O‘yinlarni ochish",web_app:{url:WEBAPP_URL}}]]}});
        }
      }
    }catch(e){ await new Promise(r=>setTimeout(r,2500)); }
  }
}
pollBot();

// Waiting rooms and live games.
const waiting = { chess: [], billiards: [] };
const rooms = new Map();
const socketsByUser = new Map();
function makeRoom(type, a, b, stake){
  const id=`${type}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const room={id,type,players:[a,b],stake,turn:0,fen:null,balls:null,finished:false};
  if(type==="chess") room.chess=new Chess();
  rooms.set(id,room);
  db.prepare("INSERT INTO games(type,player1,player2,stake,status) VALUES(?,?,?,?,?)").run(type,a,b,stake,"playing");
  return room;
}
function publicRoom(room){
  return {id:room.id,type:room.type,players:room.players.map(id=>{const u=getUser.get(id);return {id,name:u?.name||"Player"};}),stake:room.stake,fen:room.chess?.fen(),turn:room.turn};
}
function finishRoom(room,winner){
  if(room.finished) return; room.finished=true;
  if(winner) reward(winner,room.stake*2);
  db.prepare("UPDATE games SET winner=?,status='finished' WHERE player1=? AND player2=? AND status='playing' ORDER BY id DESC LIMIT 1").run(winner||"draw",room.players[0],room.players[1]);
  io.to(room.id).emit("game:finished",{winner,draw:!winner,coins:winner?room.stake*2:room.stake});
}
io.on("connection",socket=>{
  let me=null;
  socket.on("auth",({userId})=>{
    const u=getUser.get(String(userId)); if(!u || u.blocked) return socket.emit("error:msg","Avval hisobga kiring");
    me=String(userId); socket.data.userId=me;
    if(!socketsByUser.has(me)) socketsByUser.set(me,new Set());
    socketsByUser.get(me).add(socket.id);
  });
  socket.on("queue:join",({type})=>{
    if(!me || !["chess","billiards"].includes(type)) return;
    const cfg=readSettings(), enabled=cfg[`enabled_${type}`]==="1", cost=Number(cfg[`${type}_price`]||0);
    if(!enabled) return socket.emit("error:msg","Bu o‘yin vaqtincha yopiq");
    if(!charge(me,cost)) return socket.emit("error:msg","Coin yetarli emas");
    const idx=waiting[type].findIndex(x=>x.user!==me);
    if(idx<0){ waiting[type].push({user:me,socket:socket.id,stake:cost}); socket.emit("queue:waiting"); return; }
    const other=waiting[type].splice(idx,1)[0];
    if(other.stake!==cost){ waiting[type].push(other); waiting[type].push({user:me,socket:socket.id,stake:cost}); socket.emit("queue:waiting"); return; }
    const room=makeRoom(type,other.user,me,cost);
    socket.join(room.id);
    const os=io.sockets.sockets.get(other.socket); if(os) os.join(room.id);
    io.to(room.id).emit("game:start",publicRoom(room));
  });
  socket.on("chess:move",({roomId,from,to,promotion})=>{
    const room=rooms.get(roomId); if(!room || room.type!=="chess" || room.finished || !me) return;
    const color=room.players[room.turn]===me?"w":"b";
    if(room.chess.turn()!==color) return;
    try{
      const move=room.chess.move({from,to,promotion:promotion||"q"});
      if(!move) return;
      room.turn=room.chess.turn()==="w"?0:1;
      io.to(room.id).emit("chess:update",{fen:room.chess.fen(),lastMove:{from,to},turn:room.players[room.turn]});
      if(room.chess.isGameOver()){
        const winner=room.chess.isDraw()?null:room.players[room.chess.turn()==="w"?1:0];
        finishRoom(room,winner);
      }
    }catch{}
  });
  socket.on("billiards:shot",({roomId,angle,power})=>{
    const room=rooms.get(roomId); if(!room || room.type!=="billiards" || room.finished || !me) return;
    if(room.players[room.turn]!==me) return;
    const shot={angle:Number(angle),power:Math.max(0,Math.min(1,Number(power)))};
    io.to(room.id).emit("billiards:shot",shot);
    room.turn=1-room.turn;
    io.to(room.id).emit("billiards:turn",{userId:room.players[room.turn]});
  });
  socket.on("game:claimWin",({roomId})=>{
    const room=rooms.get(roomId); if(!room || room.finished || !me || !room.players.includes(me)) return;
    // Client may only claim a win for a game state the server has independently validated.
    if(room.type==="chess" && room.chess.isGameOver() && !room.chess.isDraw()){
      finishRoom(room,room.players[room.chess.turn()==="w"?1:0]);
    }
  });
  socket.on("disconnect",()=>{
    if(me && socketsByUser.has(me)){socketsByUser.get(me).delete(socket.id);if(!socketsByUser.get(me).size)socketsByUser.delete(me);}
    for(const type of Object.keys(waiting)) waiting[type]=waiting[type].filter(x=>x.socket!==socket.id);
  });
});

app.post("/api/play/charge",requireSignedUser,(req,res)=>{
  const {userId,type}=req.body||{};
  if(String(req.tgUser.id)!==String(userId) || !getUser.get(String(userId))) return res.status(401).json({error:"Hisob topilmadi"});
  if(!["snake"].includes(type)) return res.status(400).json({error:"Noto‘g‘ri o‘yin"});
  const cfg=readSettings(), cost=Number(cfg[`${type}_price`]||0);
  if(cfg[`enabled_${type}`]!=="1") return res.status(403).json({error:"O‘yin yopiq"});
  if(!charge(userId,cost)) return res.status(400).json({error:"Coin yetarli emas"});
  res.json({ok:true,coins:getUser.get(String(userId)).coins});
});
app.get("/api/admin/:id",requireSignedUser,(req,res)=>{
  const id=String(req.params.id); if(!isAdmin(id) || String(req.tgUser.id)!==id) return res.status(403).json({error:"Ruxsat yo‘q"});
  res.json({
    users:db.prepare("SELECT COUNT(*) n FROM users").get().n,
    games:db.prepare("SELECT COUNT(*) n FROM games").get().n,
    active:db.prepare("SELECT COUNT(*) n FROM games WHERE status='playing'").get().n,
    donations:db.prepare("SELECT COALESCE(SUM(amount),0) n FROM donations").get().n,
    settings:readSettings()
  });
});
app.post("/api/admin/:id/settings",requireSignedUser,(req,res)=>{
  const id=String(req.params.id); if(!isAdmin(id) || String(req.tgUser.id)!==id) return res.status(403).json({error:"Ruxsat yo‘q"});
  const allowed=["chess_price","billiards_price","snake_price","enabled_chess","enabled_billiards","enabled_snake"];
  const tx=db.transaction(obj=>{for(const k of allowed) if(obj[k]!==undefined) db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k,String(obj[k]));});
  tx(req.body||{}); res.json({ok:true,settings:readSettings()});
});
app.post("/api/admin/:id/coins",requireSignedUser,(req,res)=>{
  const id=String(req.params.id); if(!isAdmin(id) || String(req.tgUser.id)!==id) return res.status(403).json({error:"Ruxsat yo‘q"});
  const target=String(req.body.userId||""), amount=Math.trunc(Number(req.body.amount));
  if(!getUser.get(target)||!Number.isFinite(amount)||Math.abs(amount)>1000000) return res.status(400).json({error:"Ma’lumot xato"});
  db.prepare("UPDATE users SET coins=MAX(0,coins+?) WHERE id=?").run(amount,target); res.json({ok:true});
});
app.post("/api/admin/:id/block",requireSignedUser,(req,res)=>{
  const id=String(req.params.id); if(!isAdmin(id) || String(req.tgUser.id)!==id) return res.status(403).json({error:"Ruxsat yo‘q"});
  db.prepare("UPDATE users SET blocked=? WHERE id=?").run(req.body.blocked?1:0,String(req.body.userId)); res.json({ok:true});
});
app.get("/health",(req,res)=>res.json({ok:true,service:"PaxtaGram GAME HUB"}));
server.listen(PORT,()=>console.log(`GAME HUB running on :${PORT}`));
function shutdown(){ try{ db.pragma("wal_checkpoint(TRUNCATE)"); db.close(); }catch{} process.exit(0); }
process.on("SIGTERM",shutdown); process.on("SIGINT",shutdown);
