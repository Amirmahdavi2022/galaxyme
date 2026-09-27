(()=>{
'use strict';
const $=id=>document.getElementById(id);
const tg=(window.Telegram&&window.Telegram.WebApp)||null;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const TARGET_S=45, KEY='galaxyme.v1', GR=1000;
const fmt=n=>Math.round(n).toLocaleString('en-US');
const GENESIS=__GENESIS__;

/* ---------- state ---------- */
function rndHex(n){const b=new Uint8Array(n);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
let S=null;
try{const raw=localStorage.getItem(KEY);if(raw){const p=JSON.parse(raw);if(p&&p.v===1&&Array.isArray(p.blocks)&&p.blocks.length&&p.blocks[0].hash===GENESIS.hash)S=p;}}catch(_){}
if(!S)S={v:1,addr:rndHex(20),blocks:[GENESIS],E:2**23,balance:0,sharesTotal:0};
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(_){}}
const stars=new Map();
for(const b of S.blocks)stars.set(b.height,starFrom(b));
const tip=()=>S.blocks[S.blocks.length-1];

/* ---------- haptics ---------- */
function buzz(kind){try{if(tg&&tg.HapticFeedback){kind==='success'?tg.HapticFeedback.notificationOccurred('success'):tg.HapticFeedback.impactOccurred(kind||'light');}else if(navigator.vibrate){navigator.vibrate(kind==='success'?[18,60,28]:10);}}catch(_){}}
if(tg){try{tg.ready();tg.expand();tg.setHeaderColor&&tg.setHeaderColor('#070816');tg.setBackgroundColor&&tg.setBackgroundColor('#070816');}catch(_){}}

/* ---------- formatting ---------- */
function rateTxt(r){if(!r)return '—';if(r>=1e6)return (r/1e6).toFixed(2)+' MH/s';if(r>=1e3)return (r/1e3).toFixed(r>=1e5?0:1)+' kH/s';return Math.round(r)+' H/s';}
function ago(sec){const d=Math.max(0,Date.now()/1000-sec);if(d<45)return 'just now';if(d<3600)return Math.round(d/60)+' min ago';if(d<86400)return Math.round(d/3600)+' h ago';return Math.round(d/86400)+' d ago';}
function zeroHex(h){const i=h.search(/[^0]/);const z=i<0?h.length:i;return '<span class="z">'+h.slice(0,z)+'</span>'+h.slice(z);}
const ERA_NAMES=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
const CLASS_COLORS={origin:'#FFD27A',main:'#FFE2B8',giant:'#FF9A6B',binary:'#B7D3FF',pulsar:'#9FE8FF',hole:'#FF8A4C'};

/* ---------- balance + toast ---------- */
function renderBal(){$('balv').textContent=fmt(S.balance);}
let toastT=0;
function toast(msg){$('toastT').textContent=msg;const t=$('toast');t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600);}

/* ---------- star art ---------- */
const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
function mix(c,d,t){return [c[0]+(d[0]-c[0])*t,c[1]+(d[1]-c[1])*t,c[2]+(d[2]-c[2])*t].map(Math.round);}
function drawSun(ctx,x,y,r,c,glow){
  const g=ctx.createRadialGradient(x,y,0,x,y,r*glow);g.addColorStop(0,rgba(c,.55));g.addColorStop(.35,rgba(c,.16));g.addColorStop(1,rgba(c,0));
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*glow,0,7);ctx.fill();
  const b=ctx.createRadialGradient(x-r*.25,y-r*.25,0,x,y,r);b.addColorStop(0,'#fff');b.addColorStop(.45,rgba(mix(c,[255,255,255],.55),1));b.addColorStop(1,rgba(c,1));
  ctx.fillStyle=b;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();}
function drawPlanet(ctx,p,x,y,sz,light,lx,ly){
  const a=Math.atan2(ly-y,lx-x);const g=ctx.createRadialGradient(x+Math.cos(a)*sz*.45,y+Math.sin(a)*sz*.45,sz*.1,x,y,sz);
  g.addColorStop(0,rgba(mix(p.tone,[255,255,255],.35),1));g.addColorStop(.6,rgba(p.tone,1));g.addColorStop(1,rgba(mix(p.tone,[8,8,24],.75),1));
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,sz,0,7);ctx.fill();
  if(p.ring){ctx.strokeStyle=rgba(mix(p.tone,[255,255,255],.4),.75);ctx.lineWidth=Math.max(1,sz*.22);ctx.beginPath();ctx.ellipse(x,y,sz*2,sz*.55,-.35,0,7);ctx.stroke();}}
function scene(ctx,s,W,t,opts){
  opts=opts||{};const cx=W/2,cy=W/2,tilt=.36;ctx.clearRect(0,0,W,W);
  const orbitR=o=>o*W*.62;
  const pl=(opts.planets===false?[]:s.planets).map(p=>{const ang=p.phase+t*p.speed*.25;const R=orbitR(p.orbit);return {p,x:cx+Math.cos(ang)*R,y:cy+Math.sin(ang)*R*tilt,back:Math.sin(ang)<0,sz:p.size*W/300};});
  if(opts.orbits!==false){ctx.strokeStyle='rgba(146,150,198,.16)';ctx.lineWidth=1;for(const q of pl){const R=orbitR(q.p.orbit);ctx.beginPath();ctx.ellipse(cx,cy,R,R*tilt,0,0,7);ctx.stroke();}}
  const drawPl=back=>{for(const q of pl)if(q.back===back){drawPlanet(ctx,q.p,q.x,q.y,q.sz,s.color,cx,cy);for(let m=0;m<q.p.moons;m++){const ma=t*.9+m*2.1;ctx.fillStyle='rgba(220,222,240,.8)';ctx.beginPath();ctx.arc(q.x+Math.cos(ma)*q.sz*2.4,q.y+Math.sin(ma)*q.sz*1.1,Math.max(.8,q.sz*.22),0,7);ctx.fill();}}};
  drawPl(true);
  const base=W*.1*(opts.scale||1);
  switch(s.cls){
    case 'giant':drawSun(ctx,cx,cy,base*1.75,s.color,3.2);break;
    case 'binary':{const a=t*.5,d=W*.1;drawSun(ctx,cx+Math.cos(a)*d,cy+Math.sin(a)*d*tilt,base*.75,s.color,3);drawSun(ctx,cx-Math.cos(a)*d,cy-Math.sin(a)*d*tilt,base*.55,s.color2,3);break;}
    case 'pulsar':{const a=t*1.4;ctx.save();ctx.translate(cx,cy);ctx.rotate(a);for(const dir of [1,-1]){const g=ctx.createLinearGradient(0,0,0,dir*W*.48);g.addColorStop(0,'rgba(190,235,255,.7)');g.addColorStop(1,'rgba(190,235,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-3,0);ctx.lineTo(-W*.05,dir*W*.48);ctx.lineTo(W*.05,dir*W*.48);ctx.lineTo(3,0);ctx.fill();}ctx.restore();drawSun(ctx,cx,cy,base*.42,s.color,5.5);break;}
    case 'hole':{const r=base*1.05;const disk=(front)=>{ctx.save();ctx.beginPath();front?ctx.rect(0,cy,W,W):ctx.rect(0,0,W,cy);ctx.clip();for(let i=0;i<5;i++){ctx.strokeStyle=`rgba(255,${150+i*18},${70+i*25},${.5-i*.07})`;ctx.lineWidth=r*(.5-i*.06);ctx.beginPath();ctx.ellipse(cx,cy,r*(2.1+i*.28),r*(2.1+i*.28)*.26,0,0,7);ctx.stroke();}ctx.restore();};
      const g=ctx.createRadialGradient(cx,cy,r*.9,cx,cy,r*3.4);g.addColorStop(0,'rgba(255,170,90,.35)');g.addColorStop(1,'rgba(255,170,90,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r*3.4,0,7);ctx.fill();
      disk(false);ctx.fillStyle='#000';ctx.beginPath();ctx.arc(cx,cy,r,0,7);ctx.fill();ctx.strokeStyle='rgba(255,226,180,.9)';ctx.lineWidth=Math.max(1,r*.06);ctx.beginPath();ctx.arc(cx,cy,r*1.04,0,7);ctx.stroke();disk(true);break;}
    case 'origin':{ctx.save();ctx.translate(cx,cy);for(let i=0;i<8;i++){ctx.rotate(Math.PI/4);const g=ctx.createLinearGradient(0,0,W*.4,0);g.addColorStop(0,'rgba(255,210,122,.5)');g.addColorStop(1,'rgba(255,210,122,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(W*.4,0);ctx.lineTo(0,2);ctx.fill();}ctx.restore();drawSun(ctx,cx,cy,base*1.2,[255,200,110],3.4);break;}
    default:drawSun(ctx,cx,cy,base*Math.min(1.35,Math.max(.6,Math.sqrt(s.radius||1))),s.color,3);}
  drawPl(false);}
function thumb(s){const c=document.createElement('canvas');const d=Math.min(2,devicePixelRatio||1);c.width=c.height=64*d;const x=c.getContext('2d');x.scale(d,d);scene(x,s,64,0,{orbits:false,scale:2.1});return c;}

/* ---------- galaxy ---------- */
const sky=$('sky'),sx=sky.getContext('2d');
let VW=0,VH=0,DPR=1,fitZ=1;
const cam={x:0,y:0,z:1};
let dust=null,bgStars=[];
function seeded(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function gauss(R){return (R()+R()+R()-1.5)/1.5;}
function buildDust(){
  const D=2048,c=document.createElement('canvas');c.width=c.height=D;const x=c.getContext('2d');const R=seeded(1790553600);const o=D/2,sc=D/2/1.08;
  let g=x.createRadialGradient(o,o,0,o,o,sc*.42);g.addColorStop(0,'rgba(255,214,160,.55)');g.addColorStop(.25,'rgba(255,170,120,.16)');g.addColorStop(1,'rgba(120,120,255,0)');x.fillStyle=g;x.fillRect(0,0,D,D);
  for(let i=0;i<46;i++){const arm=i%4,t=.12+R()*.85,ang=arm*Math.PI/2+t*2.6*Math.PI+gauss(R)*.08,rad=(.07+.88*t)*sc;const px=o+Math.cos(ang)*rad,py=o+Math.sin(ang)*rad,rr=40+R()*110;
    const hue=R();const col=hue<.45?'255,110,170':hue<.8?'110,150,255':'90,220,210';g=x.createRadialGradient(px,py,0,px,py,rr);g.addColorStop(0,`rgba(${col},${.1+R()*.08})`);g.addColorStop(1,`rgba(${col},0)`);x.fillStyle=g;x.beginPath();x.arc(px,py,rr,0,7);x.fill();}
  x.globalCompositeOperation='lighter';
  for(let arm=0;arm<4;arm++)for(let t=.02;t<1;t+=.004){const ang=arm*Math.PI/2+t*2.6*Math.PI,rad=(.07+.88*t)*sc;const px=o+Math.cos(ang)*rad,py=o+Math.sin(ang)*rad,rr=(26+70*t)*(1+.25*Math.sin(t*37+arm));
    const col=mix([255,214,170],[130,165,255],Math.min(1,t*1.4));const gg=x.createRadialGradient(px,py,0,px,py,rr);gg.addColorStop(0,rgba(col,.05*(1.1-t*.6)));gg.addColorStop(1,rgba(col,0));x.fillStyle=gg;x.beginPath();x.arc(px,py,rr,0,7);x.fill();}
  g=x.createRadialGradient(o,o,0,o,o,sc*.2);g.addColorStop(0,'rgba(255,236,200,.9)');g.addColorStop(.3,'rgba(255,190,130,.35)');g.addColorStop(1,'rgba(255,150,100,0)');x.fillStyle=g;x.fillRect(0,0,D,D);
  for(let i=0;i<14000;i++){let px,py,t;
    if(i<9000){const arm=i%4;t=Math.pow(R(),.85);const spread=(.34-.16*t);const ang=arm*Math.PI/2+t*2.6*Math.PI+gauss(R)*spread;const rad=(.07+.88*t+gauss(R)*.035)*sc;px=o+Math.cos(ang)*rad;py=o+Math.sin(ang)*rad;}
    else{const a=R()*7,r=Math.pow(R(),.6)*sc*1.02;px=o+Math.cos(a)*r;py=o+Math.sin(a)*r;t=r/sc;}
    const col=mix([255,222,176],[170,196,255],Math.min(1,t*1.3));x.fillStyle=rgba(col,.18+R()*.6);const s=.7+R()*R()*1.9;x.beginPath();x.arc(px,py,s,0,7);x.fill();}
  x.globalCompositeOperation='source-over';return c;}
function resize(){const r=sky.getBoundingClientRect();DPR=Math.min(2,devicePixelRatio||1);VW=r.width;VH=r.height;sky.width=Math.round(VW*DPR);sky.height=Math.round(VH*DPR);
  const prevFit=fitZ;fitZ=Math.min(VW,VH-120)/(2*GR)*1.05;if(!resize.done){cam.z=fitZ*1.25;resize.done=true;}else cam.z*=fitZ/prevFit;
  const R=seeded(7);bgStars=[];for(let i=0;i<Math.round(VW*VH/1400);i++)bgStars.push([R()*VW,R()*VH,R()*.9+.2,R()*7]);dirty=true;}
const w2s=(wx,wy)=>[(wx-cam.x)*cam.z+VW/2,(wy-cam.y)*cam.z+VH/2];
let dirty=true,animT=0,fly=null,flash=null,skyOn=true,selected=null;
const spriteCache=new Map();
function sprite(c){const k=c.join();let s=spriteCache.get(k);if(s)return s;s=document.createElement('canvas');s.width=s.height=64;const x=s.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.12,rgba(mix(c,[255,255,255],.4),.95));g.addColorStop(.3,rgba(c,.35));g.addColorStop(1,rgba(c,0));x.fillStyle=g;x.fillRect(0,0,64,64);spriteCache.set(k,s);return s;}
function drawSky(now){
  const x=sx;x.setTransform(DPR,0,0,DPR,0,0);x.fillStyle='#070816';x.fillRect(0,0,VW,VH);
  for(const s of bgStars){const a=reduce?s[2]*.5:s[2]*(.35+.25*Math.sin(now/900+s[3]));x.fillStyle=`rgba(210,214,255,${a})`;x.fillRect(s[0]+(-cam.x*cam.z*.02)%VW,s[1],1,1);}
  const D=2048,half=GR*1.08;x.save();x.translate(VW/2,VH/2);x.scale(cam.z,cam.z);x.translate(-cam.x,-cam.y);x.globalAlpha=.95;x.drawImage(dust,-half,-half,half*2,half*2);x.restore();
  const zf=cam.z/fitZ;
  for(const s of stars.values()){const [px,py]=w2s(s.x*GR,s.y*GR);if(px<-40||py<-40||px>VW+40||py>VH+40)continue;
    const tw=reduce?1:.82+.18*Math.sin(now/700+s.twinkle);
    let size=(s.cls==='origin'?30:s.cls==='hole'?24:s.cls==='giant'?22:s.cls==='pulsar'?16:s.cls==='binary'?20:15)*Math.min(2.2,Math.pow(zf,.45));
    if(s.cls==='hole'){x.fillStyle='rgba(255,150,80,.35)';x.beginPath();x.ellipse(px,py,size*.8,size*.26,-.3,0,7);x.fill();x.fillStyle='#000';x.beginPath();x.arc(px,py,size*.22,0,7);x.fill();x.strokeStyle='rgba(255,220,170,.9)';x.lineWidth=1.2;x.stroke();}
    else{x.globalAlpha=tw;if(s.cls!=='origin'){const L=size*(.9+.15*tw);x.strokeStyle=rgba(mix(s.color,[255,255,255],.5),.55);x.lineWidth=1;x.beginPath();x.moveTo(px-L,py);x.lineTo(px+L,py);x.moveTo(px,py-L);x.lineTo(px,py+L);x.stroke();}x.drawImage(sprite(s.color),px-size/2,py-size/2,size,size);if(s.cls==='binary'&&s.color2){x.drawImage(sprite(s.color2),px-size*.1,py-size*.45,size*.6,size*.6);}x.globalAlpha=1;}
    if(zf>2.2&&s.cls!=='origin'){x.font='600 11px Figtree,system-ui,sans-serif';x.fillStyle='rgba(241,240,255,.75)';x.fillText(s.name,px+size*.35+4,py+4);}
    if(s===selected){const pr=reduce?0:(now%1600)/1600;x.strokeStyle=`rgba(255,181,71,${.9-pr*.7})`;x.lineWidth=1.5;x.beginPath();x.arc(px,py,size*.55+pr*14,0,7);x.stroke();}}
  if(flash){const k=(now-flash.t0)/1400;if(k>=1)flash=null;else{const [px,py]=w2s(flash.x,flash.y);const r=10+k*160;x.strokeStyle=`rgba(255,214,150,${(1-k)*.9})`;x.lineWidth=2*(1-k)+.5;x.beginPath();x.arc(px,py,r,0,7);x.stroke();
    const g=x.createRadialGradient(px,py,0,px,py,60*(1-k)+10);g.addColorStop(0,`rgba(255,240,210,${(1-k)*.8})`);g.addColorStop(1,'rgba(255,240,210,0)');x.fillStyle=g;x.beginPath();x.arc(px,py,70,0,7);x.fill();}}
}
const easeInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function frame(now){
  if(fly){const k=Math.min(1,(now-fly.t0)/fly.d),e=easeInOut(k);cam.x=fly.a.x+(fly.b.x-fly.a.x)*e;cam.y=fly.a.y+(fly.b.y-fly.a.y)*e;cam.z=fly.a.z*Math.pow(fly.b.z/fly.a.z,e);if(k>=1){const cb=fly.done;fly=null;cb&&cb();}}
  if(skyOn&&!document.hidden)drawSky(now);
  requestAnimationFrame(frame);}
function flyTo(wx,wy,z,done){const b={x:wx,y:wy,z:Math.min(fitZ*14,Math.max(fitZ*.6,z))};if(reduce){Object.assign(cam,b);done&&done();return;}fly={a:{x:cam.x,y:cam.y,z:cam.z},b,t0:performance.now(),d:1100,done};}
function clampCam(){const lim=GR*1.1;const d=Math.hypot(cam.x,cam.y);if(d>lim){cam.x*=lim/d;cam.y*=lim/d;}cam.z=Math.min(fitZ*14,Math.max(fitZ*.6,cam.z));}
// gestures
const pts=new Map();let gest=null;
sky.addEventListener('pointerdown',e=>{sky.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);fly=null;
  if(pts.size===1)gest={type:'pan',sx:e.clientX,sy:e.clientY,cx:cam.x,cy:cam.y,t:performance.now(),moved:0};
  else if(pts.size===2){const [a,b]=[...pts.values()];gest={type:'pinch',d:Math.hypot(a[0]-b[0],a[1]-b[1]),z:cam.z,mx:(a[0]+b[0])/2,my:(a[1]+b[1])/2,cx:cam.x,cy:cam.y,moved:99};}});
sky.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId)||!gest)return;pts.set(e.pointerId,[e.clientX,e.clientY]);
  if(gest.type==='pan'&&pts.size===1){const dx=e.clientX-gest.sx,dy=e.clientY-gest.sy;gest.moved=Math.max(gest.moved,Math.hypot(dx,dy));cam.x=gest.cx-dx/cam.z;cam.y=gest.cy-dy/cam.z;clampCam();}
  else if(gest.type==='pinch'&&pts.size===2){const [a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);const r=sky.getBoundingClientRect();const mx=(a[0]+b[0])/2-r.left,my=(a[1]+b[1])/2-r.top;
    const nz=Math.min(fitZ*14,Math.max(fitZ*.6,gest.z*d/gest.d));const wx=gest.cx+((gest.mx-r.left)-VW/2)/gest.z,wy=gest.cy+((gest.my-r.top)-VH/2)/gest.z;cam.z=nz;cam.x=wx-(mx-VW/2)/nz;cam.y=wy-(my-VH/2)/nz;clampCam();}});
function endPtr(e){if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);
  if(gest&&gest.type==='pan'&&pts.size===0&&gest.moved<8&&performance.now()-gest.t<400){const r=sky.getBoundingClientRect();tapAt(e.clientX-r.left,e.clientY-r.top);}
  if(pts.size===0)gest=null;else if(pts.size===1){const [p]=[...pts.values()];gest={type:'pan',sx:p[0],sy:p[1],cx:cam.x,cy:cam.y,t:0,moved:99};}}
sky.addEventListener('pointerup',endPtr);sky.addEventListener('pointercancel',endPtr);
sky.addEventListener('wheel',e=>{e.preventDefault();const r=sky.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;const wx=cam.x+(mx-VW/2)/cam.z,wy=cam.y+(my-VH/2)/cam.z;
  cam.z=Math.min(fitZ*14,Math.max(fitZ*.6,cam.z*Math.exp(-e.deltaY*.0015)));cam.x=wx-(mx-VW/2)/cam.z;cam.y=wy-(my-VH/2)/cam.z;clampCam();},{passive:false});
function tapAt(px,py){let best=null,bd=28;for(const s of stars.values()){const [x,y]=w2s(s.x*GR,s.y*GR);const d=Math.hypot(x-px,y-py);if(d<bd){bd=d;best=s;}}if(best){selected=best;buzz('light');openSheet(best,false);}}

/* ---------- mining ---------- */
const WSRC=document.getElementById('wsrc').textContent;
const worker=new Worker(URL.createObjectURL(new Blob([WSRC],{type:'text/javascript'})));
let mining=false,job=null,jobId=0,rate=0,winH=0,winT=performance.now(),blockShares=0;
function newJob(){const t=tip();jobId++;const n=new Uint32Array(2);crypto.getRandomValues(n);
  job={id:jobId,tpl:{height:t.height+1,prev:t.hash,miner:S.addr,time:Math.floor(Date.now()/1000),thr:thrFor(S.E),xn:[n[0],n[1]],nonce:[0,0]},hashes:0,t0:performance.now()};
  const h=buildHeader(job.tpl);worker.postMessage({cmd:'job',id:jobId,header:h.buffer,thr:job.tpl.thr,sthr:shareThr(S.E)},[h.buffer]);blockShares=0;renderRig();}
function setMining(on){mining=on;const c=$('core');c.classList.toggle('on',on);c.setAttribute('aria-pressed',String(on));c.setAttribute('aria-label',on?'Stop mining':'Start mining');
  $('coreIcon').innerHTML=on?'<rect x="7" y="6" width="3.6" height="12" rx="1"/><rect x="13.4" y="6" width="3.6" height="12" rx="1"/>':'<path d="M8 5.5v13l10.5-6.5L8 5.5z"/>';
  if(on){if(!job)newJob();worker.postMessage({cmd:'start'});requestWake();}else{worker.postMessage({cmd:'stop'});releaseWake();}
  $('hint').style.opacity=on?'0':'1';}
$('core').addEventListener('click',()=>{buzz('medium');setMining(!mining);});
let lastSpark=0;
worker.onmessage=e=>{const m=e.data;
  if(m.t==='p'){winH+=m.h;if(job)job.hashes+=m.h;blockShares+=m.s;S.sharesTotal+=m.s;const now=performance.now();
    if(now-winT>=1000){const r=winH/((now-winT)/1000);rate=rate?rate*.6+r*.4:r;winH=0;winT=now;}
    if(m.s>0&&now-lastSpark>350&&skyOn){lastSpark=now;spark();}renderRig();}
  else if(m.t==='f'&&job&&m.id===job.id){found(m);}};
function found(m){
  const b=Object.assign({},job.tpl,{nonce:m.nonce,hash:m.hash});
  const o=hashBlock(b);if(wordsToHex(o)!==m.hash||!below(o,b.thr)){newJob();return;} // never trust the worker blindly
  const secs=(performance.now()-job.t0)/1000;const r=job.hashes/Math.max(1,secs);
  S.blocks.push(b);const reward=rewardAt(b.height);S.balance+=reward;
  if(r>0){S.E=Math.min(S.E*4,Math.max(S.E/4,r*TARGET_S));S.E=Math.max(2**18,S.E);}
  save();const s=starFrom(b);stars.set(b.height,s);
  job=null;if(mining)newJob();
  buzz('success');renderBal();const bal=$('bal');bal.classList.add('bump');setTimeout(()=>bal.classList.remove('bump'),180);
  toast('+'+fmt(reward)+' Stardust');renderStars();renderChain();
  if(skyOn){selected=s;flyTo(s.x*GR,s.y*GR,fitZ*4.2,()=>{flash={x:s.x*GR,y:s.y*GR,t0:performance.now()};setTimeout(()=>openSheet(s,true),reduce?0:650);});}
  else{selected=s;openSheet(s,true);}}
function renderRig(){$('rate').textContent=rateTxt(mining?rate:0);$('blockno').textContent='Block #'+fmt(tip().height+1);$('shares').textContent=fmt(blockShares);
  const p=job?1-Math.exp(-job.hashes/S.E):0;$('ring').style.setProperty('--p',p.toFixed(3));
  $('eta').textContent=rate>0&&mining?'~'+Math.max(1,Math.round(S.E/rate))+' s per star':'~'+TARGET_S+' s per star';}
function spark(){if(reduce)return;const core=$('core').getBoundingClientRect(),host=$('v-galaxy').getBoundingClientRect();const d=document.createElement('span');d.className='spark';
  d.style.left=(core.left-host.left+core.width/2-3)+'px';d.style.top=(core.top-host.top+core.height/2-3)+'px';$('v-galaxy').appendChild(d);
  const ang=-Math.PI/2+(Math.random()-.5)*1.4,dist=60+Math.random()*50;
  d.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(ang)*dist}px,${Math.sin(ang)*dist}px) scale(.5)`,opacity:0}],{duration:700,easing:'cubic-bezier(0.23,1,0.32,1)'}).onfinish=()=>d.remove();}
let wake=null;async function requestWake(){try{wake=await navigator.wakeLock.request('screen');}catch(_){}}
function releaseWake(){try{wake&&wake.release();}catch(_){}wake=null;}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mining)requestWake();});

/* ---------- sheet ---------- */
const sheet=$('sheet'),scrim=$('scrim'),sc=$('scene');let sheetStar=null,sheetT0=0;
function openSheet(s,isNew){sheetStar=s;sheetT0=performance.now();
  $('seyebrow').textContent=isNew?'New star discovered':s.cls==='origin'?'Genesis':'Block '+fmt(s.height);
  $('sname').textContent=s.name;
  const col=CLASS_COLORS[s.cls]||'#fff';
  $('smeta').innerHTML=`<span class="badge" style="color:${col};border-color:${col}55">${s.className}</span><span class="tag num">${s.designation}</span>`;
  const f=[];
  if(s.cls==='hole'){f.push(['Mass',s.mass+' M☉']);f.push(['Event horizon',(s.mass*2.95).toFixed(1)+' km']);}
  else if(s.cls==='pulsar'){f.push(['Spin period',s.period+' ms']);f.push(['Surface temp',fmt(s.temp)+' K']);}
  else if(s.cls==='binary'){f.push(['Primary',fmt(s.temp)+' K']);f.push(['Companion',fmt(s.temp2)+' K']);}
  else{f.push(['Temperature',fmt(s.temp)+' K']);f.push(['Radius',(s.radius>=10?fmt(s.radius):s.radius.toFixed(2))+' R☉']);}
  f.push(['Planets',String(s.planets.length)+(s.planets.some(p=>p.ring)?' · ringed':'')]);
  f.push(['Rarity',s.odds]);
  const b=S.blocks[s.height];f.push(['Found',s.height===0?'at genesis':ago(b.time)]);f.push(['Reward',s.height===0?'—':fmt(rewardAt(s.height))+' ✦']);
  $('facts').innerHTML=f.map(([k,v])=>`<div class="fact"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('shash').innerHTML='<span class="l">Block hash</span>'+zeroHex(b.hash);
  const d=Math.min(2,devicePixelRatio||1);const w=Math.min(340,sheet.clientWidth-40||300);sc.width=sc.height=Math.round(w*d);
  sheet.inert=false;sheet.style.transform='';scrim.classList.add('open');sheet.classList.add('open');$('sbody').scrollTop=0;
  if(tg&&tg.BackButton){try{tg.BackButton.show();}catch(_){}}}
function closeSheet(){sheet.classList.remove('open');scrim.classList.remove('open');sheet.style.transform='';sheet.inert=true;sheetStar=null;if(tg&&tg.BackButton){try{tg.BackButton.hide();}catch(_){}}}
scrim.addEventListener('click',closeSheet);if(tg&&tg.BackButton){try{tg.BackButton.onClick(closeSheet);}catch(_){}}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheetStar)closeSheet();});
function sheetLoop(now){if(sheetStar){const x=sc.getContext('2d');x.setTransform(1,0,0,1,0,0);scene(x,sheetStar,sc.width,reduce?0:(now-sheetT0)/1000);}requestAnimationFrame(sheetLoop);}
// drag to dismiss (from the handle or the art)
let drag=null;
function dStart(e){if(e.target.closest('.body')&&$('sbody').scrollTop>0)return;if(drag)return;drag={id:e.pointerId,y:e.clientY,t:Date.now(),dy:0};e.currentTarget.setPointerCapture(e.pointerId);sheet.style.transition='none';}
function dMove(e){if(!drag||e.pointerId!==drag.id)return;let dy=e.clientY-drag.y;if(dy<0)dy=-Math.sqrt(-dy)*2;drag.dy=dy;sheet.style.transform=`translateY(${dy}px)`;}
function dEnd(e){if(!drag||e.pointerId!==drag.id)return;const v=Math.abs(drag.dy)/Math.max(1,Date.now()-drag.t);const dy=drag.dy;drag=null;sheet.style.transition='';
  if(dy>120||(dy>10&&v>0.11))closeSheet();else sheet.style.transform='';}
for(const el of [$('grab'),sc]){el.addEventListener('pointerdown',dStart);el.addEventListener('pointermove',dMove);el.addEventListener('pointerup',dEnd);el.addEventListener('pointercancel',dEnd);}
$('grab').style.touchAction='none';sc.style.touchAction='none';

/* ---------- stars tab ---------- */
const FILTERS=[['all','All'],['main','Main sequence'],['giant','Giants'],['binary','Binaries'],['pulsar','Pulsars'],['hole','Black holes']];
let filter='all';
$('filters').innerHTML=FILTERS.map(([k,l])=>`<button class="chip" data-f="${k}" aria-pressed="${k==='all'}">${l}</button>`).join('');
$('filters').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;filter=b.dataset.f;for(const c of $('filters').children)c.setAttribute('aria-pressed',String(c===b));renderStars();});
function renderStars(){const list=[...stars.values()].filter(s=>s.cls!=='origin').reverse();const mine=list.length;
  $('starCount').textContent=mine+(mine===1?' found':' found');
  const shown=list.filter(s=>filter==='all'||s.cls===filter).slice(0,240);const g=$('grid');g.innerHTML='';
  if(!mine){g.innerHTML='<div class="empty" style="grid-column:1/-1"><b>No stars yet</b>Start mining from the Galaxy tab. Most blocks give a main sequence star. About 1 in 1,024 collapses into a black hole.</div>';return;}
  if(!shown.length){g.innerHTML='<div class="empty" style="grid-column:1/-1"><b>None of these yet</b>'+(FILTERS.find(f=>f[0]===filter)[1])+' are rarer. Keep mining.</div>';return;}
  for(const s of shown){const t=document.createElement('button');t.className='tile';t.appendChild(thumb(s));t.insertAdjacentHTML('beforeend',`<span class="n">${s.name}</span><span class="d">${s.designation}</span>`);t.addEventListener('click',()=>{buzz('light');selected=s;openSheet(s,false);});g.appendChild(t);}}

/* ---------- chain tab ---------- */
function renderChain(){const t=tip();$('k-height').textContent=fmt(t.height);$('k-diff').textContent='2^'+Math.log2(S.E).toFixed(1);
  const recent=S.blocks.slice(-21).filter(b=>b.height>0);let avg='—';if(recent.length>=2){const span=recent[recent.length-1].time-recent[0].time;avg=Math.round(span/(recent.length-1))+' s';}$('k-time').textContent=avg;
  const era=Math.floor((t.height+1)/100000);$('k-era').textContent=(ERA_NAMES[era]||era+1)+' · '+fmt(rewardAt(t.height+1));
  $('addr').innerHTML='<span class="num" style="font-family:var(--mono)">0x'+S.addr.slice(0,6)+'…'+S.addr.slice(-4)+'</span>';
  const list=S.blocks.slice(-120).reverse();const host=$('blocks');host.innerHTML='';
  for(const b of list){const s=stars.get(b.height);const el=document.createElement('button');el.className='blk';
    el.innerHTML=`<span class="hgt">#${fmt(b.height)}</span><span class="nm">${s.name} <span class="tag"><i style="background:${CLASS_COLORS[s.cls]}"></i>${s.className}</span></span><span class="when">${b.height===0?'genesis':ago(b.time)}</span><span class="hx">${zeroHex(b.hash)}</span><span></span>`;
    el.addEventListener('click',()=>{selected=s;openSheet(s,false);});host.appendChild(el);}}
$('verify').addEventListener('click',()=>{const s=$('verifyS');s.className='s';s.textContent='Checking…';
  setTimeout(()=>{const t0=performance.now();const r=verifyChain(S.blocks);const ms=Math.round(performance.now()-t0);
    if(r.ok){s.className='s ok';s.textContent='All '+fmt(r.n)+' blocks check out · '+ms+' ms';buzz('success');}else{s.className='s bad';s.textContent='Problem at block #'+r.at+': '+r.why;}},30);});

/* ---------- nav ---------- */
function show(v){
  for(const b of document.querySelectorAll('.nav button')){if(b.dataset.v===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  for(const id of ['galaxy','stars','chain'])$('v-'+id).hidden=id!==v;skyOn=v==='galaxy';if(skyOn)resize();try{sessionStorage.setItem('gx.tab',v);}catch(_){}}
document.querySelector('.nav').addEventListener('click',e=>{const b=e.target.closest('button');if(b){buzz('light');show(b.dataset.v);}});

/* ---------- boot ---------- */
dust=buildDust();
new ResizeObserver(()=>{if(skyOn)resize();}).observe(sky);
renderBal();renderStars();renderChain();renderRig();resize();
const last=tip();if(last.height>0){const s=stars.get(last.height);cam.x=s.x*GR*.6;cam.y=s.y*GR*.6;}
requestAnimationFrame(frame);requestAnimationFrame(sheetLoop);
})();
