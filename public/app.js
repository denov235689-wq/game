const $=s=>document.querySelector(s);
const params=new URLSearchParams(location.search);
const tg=window.PaxtaGram?.WebApp || window.Telegram?.WebApp;
tg?.ready?.(); tg?.expand?.();
const initData=tg?.initData||"";
const socket=io();
let me=null, settings={}, activeRoom=null, selectedSquare=null, chessBoard=null, poolState=null;
const preview=params.get("preview")==="1";
function showModal(html){$("#modalContent").innerHTML=html;$("#modal").classList.remove("hidden");}
function closeModal(){$("#modal").classList.add("hidden");}
$("#closeModal").onclick=closeModal;
async function api(url,opts={}){const r=await fetch(url,{headers:{"content-type":"application/json","x-paxtagram-initdata":initData,...(opts.headers||{})},...opts});const d=await r.json();if(!r.ok)throw Error(d.error||"Xatolik");return d;}
async function boot(){
 try{
  const d=await api("/api/auth",{method:"POST",body:JSON.stringify({initData,previewId:preview?"demo-user":null,previewName:"Demo Player"})});
  me=d.user;settings=d.settings;$("#coins").textContent=me.coins;
  socket.emit("auth",{initData});
  applySettings();loadLeaderboard();
  if(me.admin)loadAdmin();
 }catch(e){showModal(`<h2>PaxtaGram orqali kiring</h2><p>${e.message}</p><p>Saytni bot ichidagi WebApp tugmasi orqali oching.</p><button class="secondary" onclick="location.reload()">QAYTA URINISH</button>`);}
}
function applySettings(){
 for(const [key,id] of [["chess_price","chessPrice"],["billiards_price","billiardsPrice"],["snake_price","snakePrice"]])$("#"+id).textContent=settings[key]||0;
 for(const type of ["chess","billiards","snake"])$(`[data-game="${type}"]`)?.classList.toggle("disabled-game",settings[`enabled_${type}`]==="0");
}
async function loadLeaderboard(){try{const rows=await api("/api/leaderboard");$("#leaderboard").innerHTML=rows.map((u,i)=>`<div class="leader-row"><span>${["🥇","🥈","🥉"][i]||"✦"} ${escapeHtml(u.name)}</span><b>${u.coins} ✦</b></div>`).join("")||"Hozircha natija yo‘q";}catch{}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("#playNow").onclick=()=>document.querySelector(".games").scrollIntoView({behavior:"smooth"});
$("#navGames").onclick=$("#playNow").onclick;
$("#navRating").onclick=()=>document.querySelector(".lower-grid").scrollIntoView({behavior:"smooth"});
$("#navDonate").onclick=()=>document.querySelector(".donate").scrollIntoView({behavior:"smooth"});
document.querySelectorAll("[data-play]").forEach(b=>b.onclick=()=>startGame(b.dataset.play));
async function startGame(type){
 if(type==="snake"){if(!await payLocal("snake"))return;openSnake();return;}
 showModal(`<h2>${type==="chess"?"♟ Shaxmat":"🎱 Bilyard"}</h2><p>O‘yin turini tanlang. Kirish narxi: <b>${settings[type+"_price"]||0} coin</b></p><div class="choice-row"><button id="humanMode">🌐 Real odam</button><button id="botMode">🤖 Bot bilan</button></div><p class="game-status">Real odam rejimi raqib topilishini kutadi.</p>`);
 // The modal buttons resolve through handlers set below.
 $("#humanMode").onclick=()=>{closeModal();joinQueue(type);};
 $("#botMode").onclick=()=>{closeModal();if(type==="chess")startChessBot();else startPoolBot();};
}
async function payLocal(type){const cost=Number(settings[type+"_price"]||0);if(me.coins<cost){showModal("<h2>Coin yetarli emas</h2><p>Hozircha o‘yin uchun coin yetmaydi.</p>");return false;}try{const d=await api("/api/play/charge",{method:"POST",body:JSON.stringify({userId:me.id,type})});me.coins=d.coins;$("#coins").textContent=me.coins;return true;}catch(e){showModal(`<h2>${e.message}</h2>`);return false;}}
function joinQueue(type){showModal(`<h2>Raqib qidirilmoqda…</h2><p class="game-status">Sizning o‘yiningiz: ${type==="chess"?"Shaxmat":"Bilyard"}. Coin kirish narxi hisobdan olinadi.</p><div class="choice-row"><button id="cancelQueue">BEKOR QILISH</button></div>`);socket.emit("queue:join",{type});$("#cancelQueue").onclick=closeModal;}
socket.on("queue:waiting",()=>{$("#modalContent").innerHTML=`<h2>Raqib kutilmoqda…</h2><p>Raqib topilishi bilan o‘yin avtomatik boshlanadi.</p><button class="secondary" onclick="document.querySelector('#modal').classList.add('hidden')">YOPISH</button>`;});
socket.on("game:start",room=>{closeModal();activeRoom=room;if(room.type==="chess")renderChessOnline(room);else renderPoolOnline(room);});
socket.on("error:msg",m=>showModal(`<h2>Diqqat</h2><p>${escapeHtml(m)}</p>`));
socket.on("chess:update",d=>{if(activeRoom){activeRoom.fen=d.fen;renderChessBoard(d.fen,"online");}});
socket.on("game:finished",d=>{showModal(`<h2>${d.draw?"Durrang!":d.winner===me.id?"🏆 Siz yutdingiz!":"O‘yin tugadi"}</h2><p>${d.coins||0} coin mukofot.</p><button class="primary" onclick="location.reload()">DAVOM ETISH</button>`);});
function pieces(fen){const map={};const rows=fen.split(" ")[0].split("/");const syms={p:"♟",r:"♜",n:"♞",b:"♝",q:"♛",k:"♚"};rows.forEach((row,ri)=>{let file=0;for(const c of row){if(/\d/.test(c)){file+=Number(c);continue;}const sq="abcdefgh"[file]+(8-ri);map[sq]=(c===c.toUpperCase()?syms[c.toLowerCase()]:syms[c])+ (c===c.toUpperCase()?"w":"b");file++;}});return map;}
function boardHtml(fen,mode){const p=pieces(fen);let h="";for(let r=8;r>=1;r--)for(let f=0;f<8;f++){const sq="abcdefgh"[f]+r;h+=`<button class="square ${(r+f)%2?"dark":"light"}" data-square="${sq}">${p[sq]?`<span style="color:${p[sq].endsWith("w")?"#fff":"#162235"};text-shadow:0 1px 3px #000">${p[sq][0]}</span>`:""}</button>`;}return `<h2>♟ Shaxmat</h2><p class="game-status" id="chessStatus">${mode==="bot"?"Bot bilan o‘yin":"Online o‘yin"}</p><div class="board">${h}</div><button class="secondary" id="exitGame">Chiqish</button>`;}
function renderChessBoard(fen,mode){$("#modalContent").innerHTML=boardHtml(fen,mode);$("#exitGame").onclick=closeModal;document.querySelectorAll("[data-square]").forEach(el=>el.onclick=()=>selectChess(el.dataset.square,mode));}
function renderChessOnline(room){showModal(boardHtml(room.fen,"online"));renderChessBoard(room.fen,"online");}
let botChess=null;
function startChessBot(){botChess={fen:"start",turn:"w",moves:[]};const {Chess}=window; // chess rules are server-side for online; bot demo uses legal-looking alternating moves only.
 showModal(`<h2>♟ Shaxmat — bot</h2><p class="game-status">Bot rejimi demo: doska va yurish tanlash interfeysi.</p><div class="board" id="botBoard">${Array.from({length:64},(_,i)=>`<div class="square ${(Math.floor(i/8)+i%8)%2?"dark":"light"}">${i<16?"♟":i>47?"♙":""}</div>`).join("")}</div><p>To‘liq qoidali bot uchun online rejimdagi server shaxmat mexanizmidan foydalaning.</p><button class="secondary" onclick="document.querySelector('#modal').classList.add('hidden')">YOPISH</button>`);}
function selectChess(sq,mode){if(!selectedSquare){selectedSquare=sq;document.querySelector(`[data-square="${sq}"]`)?.classList.add("selected");return;}if(mode==="online")socket.emit("chess:move",{roomId:activeRoom.id,from:selectedSquare,to:sq});selectedSquare=null;}
function startPoolBot(){showModal(`<h2>🎱 Bilyard — bot</h2><p class="game-status">Mashq rejimi. Nishonga yo‘naltiring va zarba bering.</p><canvas id="poolCanvas" class="pool-canvas" width="600" height="330"></canvas><input id="power" type="range" min="10" max="100" value="55" style="width:100%"><button class="primary" id="shoot">ZARBA BERISH</button>`);initPoolCanvas();}
function renderPoolOnline(room){activeRoom=room;startPoolBot();}
function initPoolCanvas(){const c=$("#poolCanvas"),ctx=c.getContext("2d");let balls=[{x:180,y:165,r:12,c:"#fff"},{x:420,y:165,r:12,c:"#e33"},{x:445,y:145,r:12,c:"#f3c83c"},{x:445,y:185,r:12,c:"#368cff"},{x:470,y:165,r:12,c:"#171c2c"}];function draw(){ctx.clearRect(0,0,600,330);ctx.fillStyle="#07534b";ctx.fillRect(0,0,600,330);ctx.strokeStyle="#b28a53";ctx.lineWidth=8;ctx.strokeRect(4,4,592,322);[[0,0],[300,0],[600,0],[0,330],[300,330],[600,330]].forEach(([x,y])=>{ctx.fillStyle="#07101a";ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fill();});balls.forEach(b=>{ctx.fillStyle=b.c;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ffffff66";ctx.beginPath();ctx.arc(b.x-4,b.y-4,4,0,Math.PI*2);ctx.fill();});}draw();$("#shoot").onclick=()=>{const p=Number($("#power").value)/100;balls[1].x=Math.min(570,balls[1].x+110*p);balls[1].y=Math.max(25,Math.min(305,balls[1].y+(Math.random()-.5)*70*p));draw();};}
function openSnake(){showModal(`<h2>🐍 Neon Snake</h2><div class="snake-wrap"><p>Yo‘nalish tugmalari yoki klaviaturadan foydalaning.</p><canvas id="snakeCanvas" width="320" height="320"></canvas><div><button data-dir="up">↑</button><br><button data-dir="left">←</button><button data-dir="down">↓</button><button data-dir="right">→</button></div><p>Ball: <b id="snakeScore">0</b></p><button class="secondary" id="restartSnake">QAYTA BOSHLASH</button></div>`);snakeGame();}
function snakeGame(){const c=$("#snakeCanvas"),ctx=c.getContext("2d"),n=16,size=20;let snake=[{x:7,y:8},{x:6,y:8},{x:5,y:8}],food={x:11,y:8},dir={x:1,y:0},score=0,timer;function turn(d){if(d.x!==-dir.x||d.y!==-dir.y)dir=d;}document.onkeydown=e=>{if(e.key==="ArrowUp")turn({x:0,y:-1});if(e.key==="ArrowDown")turn({x:0,y:1});if(e.key==="ArrowLeft")turn({x:-1,y:0});if(e.key==="ArrowRight")turn({x:1,y:0});};document.querySelectorAll("[data-dir]").forEach(b=>b.onclick=()=>turn(({up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}})[b.dataset.dir]));function tick(){let h={x:snake[0].x+dir.x,y:snake[0].y+dir.y};if(h.x<0||h.y<0||h.x>=n||h.y>=n||snake.some(p=>p.x===h.x&&p.y===h.y)){clearInterval(timer);$("#snakeScore").textContent=`${score} — O‘yin tugadi`;return;}snake.unshift(h);if(h.x===food.x&&h.y===food.y){score+=10;$("#snakeScore").textContent=score;food={x:Math.floor(Math.random()*n),y:Math.floor(Math.random()*n)};}else snake.pop();ctx.fillStyle="#071322";ctx.fillRect(0,0,320,320);ctx.fillStyle="#e5c65c";ctx.fillRect(food.x*size+3,food.y*size+3,14,14);snake.forEach((p,i)=>{ctx.fillStyle=i?"#168ca7":"#58f0df";ctx.fillRect(p.x*size+2,p.y*size+2,16,16);});}timer=setInterval(tick,140);$("#restartSnake").onclick=()=>{clearInterval(timer);snake=[{x:7,y:8},{x:6,y:8},{x:5,y:8}];dir={x:1,y:0};score=0;$("#snakeScore").textContent=0;timer=setInterval(tick,140);};}
document.querySelectorAll("[data-donate]").forEach(b=>b.onclick=async()=>{try{const d=await api("/api/donate",{method:"POST",body:JSON.stringify({userId:me.id,amount:Number(b.dataset.donate)})});tg?.openInvoice?.(d.url);if(!tg)window.open(d.url,"_blank");}catch(e){showModal(`<h2>Donat</h2><p>${e.message}</p>`);}});
async function loadAdmin(){const p=$("#adminPanel");p.classList.remove("hidden");try{const d=await api(`/api/admin/${me.id}`);$("#adminStats").innerHTML=[["Foydalanuvchilar",d.users],["O‘yinlar",d.games],["Faol o‘yinlar",d.active],["Donat Stars",d.donations]].map(x=>`<div class="stat"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("");$("#setChess").value=d.settings.chess_price;$("#setPool").value=d.settings.billiards_price;$("#setSnake").value=d.settings.snake_price;$("#enChess").checked=d.settings.enabled_chess==="1";$("#enPool").checked=d.settings.enabled_billiards==="1";$("#enSnake").checked=d.settings.enabled_snake==="1";}catch{}}
$("#saveSettings").onclick=async()=>{try{const d=await api(`/api/admin/${me.id}/settings`,{method:"POST",body:JSON.stringify({chess_price:$("#setChess").value,billiards_price:$("#setPool").value,snake_price:$("#setSnake").value,enabled_chess:$("#enChess").checked?"1":"0",enabled_billiards:$("#enPool").checked?"1":"0",enabled_snake:$("#enSnake").checked?"1":"0"})});settings=d.settings;applySettings();alert("Saqlandi");}catch(e){alert(e.message);}};
$("#giveCoins").onclick=async()=>{try{await api(`/api/admin/${me.id}/coins`,{method:"POST",body:JSON.stringify({userId:$("#targetUser").value,amount:Number($("#coinAmount").value)})});alert("Coin yangilandi");}catch(e){alert(e.message);}};
boot();
