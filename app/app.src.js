(()=>{
'use strict';
const $=id=>document.getElementById(id);
const tg=(window.Telegram&&window.Telegram.WebApp)||null;
const INIT=tg&&tg.initData?tg.initData:'';
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const GR=1000;
const fmt=n=>Math.round(n).toLocaleString('en-US');
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- state ---------- */
let ME=null,CH=null,REF=null,NET=null,skew=0;
const chain=[];               // every block of the shared chain, in order
const stars=new Map();        // height -> star
const mineSet=new Set();      // heights of blocks this user found
const serverNow=()=>Date.now()/1000+skew;
const tip=()=>chain[chain.length-1];

async function api(path,body){
  const r=await fetch('/api'+path,{method:body?'POST':'GET',headers:{'x-init-data':INIT,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  return r.json().catch(()=>({error:'network'}));}
function setMe(me){if(!me)return;const had=ME;ME=me;skew=me.now-Date.now()/1000;
  if(!had||had.miner!==me.miner){mineSet.clear();for(const b of chain)if(b.miner===me.miner)mineSet.add(b.height);}
  renderBal();renderRig();}
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
function renderBal(){$('balv').textContent=ME?fmt(ME.balance):'0';}
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
    if(mineSet.has(s.height)&&s.cls!=='origin'){x.strokeStyle='rgba(255,181,71,.8)';x.lineWidth=1.2;x.beginPath();x.arc(px,py,size*.42,0,7);x.stroke();}
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
/* ---------- chain sync ---------- */
let syncing=false;
async function syncChain(announce){
  if(syncing)return [];syncing=true;const fresh=[];
  try{for(;;){const from=chain.length;const rows=await fetch('/api/chain?from='+from).then(r=>r.json()).catch(()=>[]);
      for(const b of rows){if(b.height!==chain.length)continue;chain.push(b);const s=starFrom(b);stars.set(b.height,s);if(ME&&b.miner===ME.miner)mineSet.add(b.height);fresh.push(b);}
      if(rows.length<1000)break;}}
  finally{syncing=false;}
  if(fresh.length){renderStars();if(NET)renderNet();renderRig();
    if(announce)for(const b of fresh.slice(-2)){if(ME&&b.miner===ME.miner)continue;const s=stars.get(b.height);toast('Block #'+fmt(b.height)+' · '+s.name+' found by '+b.name);}}
  return fresh;}

/* ---------- mining ---------- */
const WSRC=document.getElementById('wsrc').textContent;
const worker=new Worker(URL.createObjectURL(new Blob([WSRC],{type:'text/javascript'})));
let job=null,seq=0,rate=0,winH=0,winT=performance.now(),sessShares=0,hashing=false,queue=[],busy=false,starting=false;
function state(){if(!ME)return 'loading';const t=serverNow();if(t<ME.sessionEnd)return 'mining';if(t<ME.nextAllowed)return 'rest';return 'ready';}
function mmss(s){s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function useJob(j){job=j;seq++;const h=buildHeader({height:j.h,prev:j.p,miner:j.m,time:j.t,thr:j.thr,xn:j.xn,nonce:[0,0]});
  worker.postMessage({cmd:'job',id:seq,header:h.buffer,thr:j.thr,sthr:j.sthr},[h.buffer]);
  if(!hashing){hashing=true;worker.postMessage({cmd:'start'});requestWake();}}
function stopHashing(){if(hashing){hashing=false;worker.postMessage({cmd:'stop'});releaseWake();}job=null;queue=[];rate=0;renderRig();}
async function startSession(){
  if(starting)return;starting=true;buzz('medium');
  try{const r=await api('/session/start',{});if(r.me)setMe(r.me);
    if(r.error==='join_channel'){openGate(false);return;}
    if(r.error==='gate_unavailable'){openGate(true);return;}
    if(r.error==='cooldown'){openBoost();return;}
    if(r.error==='auth'){openOutside();return;}
    if(r.job){if(sheetMode==='panel')closeSheet();sessShares=0;useJob(r.job);toast('Session started · 5 minutes');}
  }finally{starting=false;renderRig();}}
worker.onmessage=e=>{const m=e.data;
  if(m.t==='p'){winH+=m.h;const now=performance.now();if(now-winT>=1000){const r=winH/((now-winT)/1000);rate=rate?rate*.6+r*.4:r;winH=0;winT=now;}renderRig();}
  else if(m.t==='s'&&m.id===seq&&job){if(queue.length<4)queue.push({job,nonce:m.nonce});pump();}};
async function pump(){if(busy||!queue.length)return;busy=true;const q=queue.shift();
  try{const r=await api('/share',q);if(r.me)setMe(r.me);
    if(r.ok){sessShares++;spark();if(r.block){await syncChain(false);celebrate(r.block);}}
    if(r.stale){queue=[];await syncChain(true);}
    if(r.job){if(!job||r.job.h!==job.h||r.stale){queue=queue.filter(x=>x.job.h===r.job.h);}if(!job||r.job.h!==job.h)syncChain(true);useJob(r.job);}
    else if(r.error==='session_over'||(r.ok&&!r.job)||(r.stale&&!r.job)){endSession();}
  }catch(_){}
  finally{busy=false;renderRig();if(queue.length)pump();}}
function endSession(){stopHashing();buzz('light');toast('Session done · resting for an hour');refreshNet();}
function celebrate(b){const s=stars.get(b.height);if(!s)return;buzz('success');
  const bal=$('bal');bal.classList.add('bump');setTimeout(()=>bal.classList.remove('bump'),180);
  toast('You found block #'+fmt(b.height)+' · +'+fmt(b.reward*0.1)+' bonus');
  if(skyOn){selected=s;flyTo(s.x*GR,s.y*GR,fitZ*4.2,()=>{flash={x:s.x*GR,y:s.y*GR,t0:performance.now()};setTimeout(()=>openSheet(s,true),reduce?0:650);});}
  else{selected=s;openSheet(s,true);}}
const ICON_PLAY='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5L8 5.5z"/></svg>';
function renderRig(){const st=state(),t=serverNow();const c=$('core');c.classList.toggle('on',st==='mining');c.classList.toggle('rest',st==='rest');
  let p=0,label='',hint='';
  if(st==='mining'){const left=ME.sessionEnd-t;p=left/ME.rules.session;label=mmss(left);c.setAttribute('aria-label','Mining, '+label+' left');}
  else if(st==='rest'){const left=ME.nextAllowed-t;p=1-left/ME.rules.cooldown;label=mmss(left);c.setAttribute('aria-label','Resting, '+label+' left. Open skip options');hint='Resting. <b>Tap the core</b> to skip the wait.';}
  else if(st==='ready'){c.setAttribute('aria-label','Start a 5 minute session');hint='Tap the core to mine for 5 minutes. <b>Every block becomes a star.</b>';}
  else hint=INIT?'Connecting…':'Open Galaxyme from the bot in Telegram to mine.';
  $('ring').style.setProperty('--p',Math.max(0,Math.min(1,p)).toFixed(3));
  const o=$('coreFace');const want=st==='mining'||st==='rest'?'<span class="ct num">'+label+'</span>':ICON_PLAY;if(o.innerHTML!==want)o.innerHTML=want;
  $('hint').innerHTML=hint;$('hint').style.opacity=hint?'1':'0';
  $('rate').textContent=rateTxt(hashing?rate:0);$('blockno').textContent=chain.length?'Block #'+fmt(tip().height+1):'Block —';
  $('shares').textContent=fmt(sessShares);$('eta').textContent=st==='mining'?'this session':st==='rest'?'last session':'5 min sessions';
  if(sheetMode==='panel'&&$('bt'))$('bt').textContent=st==='rest'?mmss(ME.nextAllowed-t):'0:00';}
$('core').addEventListener('click',()=>{const st=state();if(st==='ready')startSession();else if(st==='rest'){buzz('light');openBoost();}else if(st==='mining'){buzz('light');toast('Mining · '+mmss(ME.sessionEnd-serverNow())+' left');}else if(!INIT)openOutside();});
function spark(){if(reduce||!skyOn)return;const core=$('core').getBoundingClientRect(),host=$('v-galaxy').getBoundingClientRect();const d=document.createElement('span');d.className='spark';
  d.style.left=(core.left-host.left+core.width/2-3)+'px';d.style.top=(core.top-host.top+core.height/2-3)+'px';$('v-galaxy').appendChild(d);
  const ang=-Math.PI/2+(Math.random()-.5)*1.4,dist=60+Math.random()*50;
  d.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(ang)*dist}px,${Math.sin(ang)*dist}px) scale(.5)`,opacity:0}],{duration:700,easing:'cubic-bezier(0.23,1,0.32,1)'}).onfinish=()=>d.remove();}
let wake=null;async function requestWake(){try{wake=await navigator.wakeLock.request('screen');}catch(_){}}
function releaseWake(){try{wake&&wake.release();}catch(_){}wake=null;}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(hashing)requestWake();refreshMe();syncChain(true);}});

/* ---------- sheet: star view and panels ---------- */
const sheet=$('sheet'),scrim=$('scrim'),sc=$('scene');let sheetStar=null,sheetT0=0,sheetMode=null;
function showSheet(mode){sheetMode=mode;$('starView').hidden=mode!=='star';$('panel').hidden=mode!=='panel';
  sheet.inert=false;sheet.style.transform='';scrim.classList.add('open');sheet.classList.add('open');$('sbody').scrollTop=0;
  if(tg&&tg.BackButton){try{tg.BackButton.show();}catch(_){}}}
function openSheet(s,isNew){sheetStar=s;sheetT0=performance.now();const b=chain[s.height];
  $('seyebrow').textContent=isNew?'You discovered a new star':s.cls==='origin'?'Genesis':'Block '+fmt(s.height);
  $('sname').textContent=s.name;
  const col=CLASS_COLORS[s.cls]||'#fff';
  $('smeta').innerHTML=`<span class="badge" style="color:${col};border-color:${col}55">${s.className}</span><span class="tag num">${s.designation}</span>`;
  const f=[];
  if(s.cls==='hole'){f.push(['Mass',s.mass+' M☉']);f.push(['Event horizon',(s.mass*2.95).toFixed(1)+' km']);}
  else if(s.cls==='pulsar'){f.push(['Spin period',s.period+' ms']);f.push(['Surface temp',fmt(s.temp)+' K']);}
  else if(s.cls==='binary'){f.push(['Primary',fmt(s.temp)+' K']);f.push(['Companion',fmt(s.temp2)+' K']);}
  else if(s.cls!=='origin'){f.push(['Temperature',fmt(s.temp)+' K']);f.push(['Radius',(s.radius>=10?fmt(s.radius):s.radius.toFixed(2))+' R☉']);}
  if(s.cls!=='origin'){f.push(['Planets',String(s.planets.length)+(s.planets.some(p=>p.ring)?' · ringed':'')]);f.push(['Rarity',s.odds]);}
  const you=ME&&b.miner===ME.miner;
  f.push(['Found by',s.height===0?'the network':you?'You':esc(b.name)]);f.push(['Found',s.height===0?'at genesis':ago(b.time)]);
  if(s.height>0)f.push(['Block reward',fmt(rewardAt(s.height))+' ✦']);
  $('facts').innerHTML=f.map(([k,v])=>`<div class="fact"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('shash').innerHTML='<span class="l">Block hash</span>'+zeroHex(b.hash);
  const d=Math.min(2,devicePixelRatio||1);const w=Math.min(340,(sheet.clientWidth||360)-40);sc.width=sc.height=Math.round(w*d);
  showSheet('star');}
function openPanel(html,bind){sheetStar=null;$('panel').innerHTML=html;bind&&bind($('panel'));showSheet('panel');renderRig();}
function closeSheet(){sheet.classList.remove('open');scrim.classList.remove('open');sheet.style.transform='';sheet.inert=true;sheetStar=null;sheetMode=null;if(tg&&tg.BackButton){try{tg.BackButton.hide();}catch(_){}}}
scrim.addEventListener('click',closeSheet);if(tg&&tg.BackButton){try{tg.BackButton.onClick(closeSheet);}catch(_){}}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheetMode)closeSheet();});
function sheetLoop(now){if(sheetStar&&sheetMode==='star'){const x=sc.getContext('2d');x.setTransform(1,0,0,1,0,0);scene(x,sheetStar,sc.width,reduce?0:(now-sheetT0)/1000);}requestAnimationFrame(sheetLoop);}
let drag=null;
function dStart(e){if(e.currentTarget===sc&&sheetMode!=='star')return;if(drag)return;drag={id:e.pointerId,y:e.clientY,t:Date.now(),dy:0};e.currentTarget.setPointerCapture(e.pointerId);sheet.style.transition='none';}
function dMove(e){if(!drag||e.pointerId!==drag.id)return;let dy=e.clientY-drag.y;if(dy<0)dy=-Math.sqrt(-dy)*2;drag.dy=dy;sheet.style.transform=`translateY(${dy}px)`;}
function dEnd(e){if(!drag||e.pointerId!==drag.id)return;const v=Math.abs(drag.dy)/Math.max(1,Date.now()-drag.t);const dy=drag.dy;drag=null;sheet.style.transition='';
  if(dy>120||(dy>10&&v>0.11))closeSheet();else sheet.style.transform='';}
for(const el of [$('grab'),sc]){el.addEventListener('pointerdown',dStart);el.addEventListener('pointermove',dMove);el.addEventListener('pointerup',dEnd);el.addEventListener('pointercancel',dEnd);}
$('grab').style.touchAction='none';sc.style.touchAction='none';

/* ---------- panels ---------- */
const STAR_ICON='<svg class="xtr" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.4l-6.1 3.5 1.5-6.8L2.2 9.5l6.9-.7L12 2.5z"/></svg>';
function openBoost(){if(!ME)return;const P=ME.rules.products,per=ME.refsPerReset,prog=ME.refs%per;
  const dots=Array.from({length:per},(_,i)=>`<i class="${i<prog?'on':''}"></i>`).join('');
  openPanel(`<div class="eyebrow">Resting</div><div class="bigtime num" id="bt">0:00</div>
  <p class="pm">Your next 5 minute session opens when this hits zero. Want in sooner?</p>
  <div class="opts">
   <button class="opt" data-p="skip30"><span class="ot"><b>${P.skip30.title}</b><small>Cuts the wait in half</small></span><span class="price num">${STAR_ICON}${P.skip30.stars}</span></button>
   <button class="opt" data-p="skip60"><span class="ot"><b>${P.skip60.title}</b><small>Mine again right now</small></span><span class="price num">${STAR_ICON}${P.skip60.stars}</span></button>
  </div>
  <div class="invite"><div class="it"><b>Invite ${per} friends, get a free reset</b><div class="dots" aria-label="${prog} of ${per} joined">${dots}</div></div>
   <small>${prog} of ${per} joined so far. A friend counts once they open Galaxyme and start mining.${ME.resets?` You have <b>${ME.resets}</b> free reset${ME.resets>1?'s':''}.`:''}</small>
   <div class="row">${ME.resets?'<button class="btn primary" id="useReset">Use a free reset</button>':''}<button class="btn" id="invite">Invite friends</button></div></div>
  <p class="pm err" id="perr" hidden></p>`,el=>{
    for(const b of el.querySelectorAll('.opt'))b.addEventListener('click',()=>buy(b.dataset.p,b));
    const inv=el.querySelector('#invite');inv&&inv.addEventListener('click',invite);
    const ur=el.querySelector('#useReset');ur&&ur.addEventListener('click',async()=>{buzz('medium');const r=await api('/boost/reset',{});if(r.me)setMe(r.me);if(r.error){showErr('That reset could not be used right now.');return;}closeSheet();toast('Rest skipped · you can mine now');});});}
function showErr(t){const e=$('perr');if(e){e.textContent=t;e.hidden=false;}}
async function buy(product,btn){if(!tg||!tg.openInvoice){showErr('Payments work inside Telegram only.');return;}
  buzz('light');btn.classList.add('wait');const r=await api('/invoice',{product});btn.classList.remove('wait');
  if(!r.link){showErr('Could not create the payment. Try again in a moment.');return;}
  tg.openInvoice(r.link,async status=>{if(status!=='paid'){if(status==='failed')showErr('The payment did not go through.');return;}
    buzz('success');const before=ME.nextAllowed;
    for(let i=0;i<12;i++){await new Promise(z=>setTimeout(z,1000));const m=await api('/me');if(m.me){setMe(m.me);if(m.me.nextAllowed!==before)break;}}
    closeSheet();toast(state()==='ready'?'Paid · you can mine now':'Paid · rest shortened');});}
function invite(){if(!REF){showErr('Invite link is not ready yet.');return;}buzz('light');
  const text='Mine stars with me on Galaxyme. Every block you find turns into a star in one shared galaxy.';
  const url='https://t.me/share/url?url='+encodeURIComponent(REF)+'&text='+encodeURIComponent(text);
  if(tg&&tg.openTelegramLink)tg.openTelegramLink(url);else window.open(url,'_blank');}
function openGate(unavailable){
  if(unavailable){openPanel(`<div class="eyebrow">Almost there</div><h3 class="ptitle">Mining opens in a moment</h3><p class="pm">The channel check isn't ready yet. Try again in a few minutes.</p><div class="row"><button class="btn primary" id="again">Try again</button></div>`,el=>el.querySelector('#again').addEventListener('click',startSession));return;}
  const ch=CH||'';openPanel(`<div class="eyebrow">One step first</div><h3 class="ptitle">Join ${esc(ch)} to mine</h3>
  <p class="pm">Mining is open to members of the ${esc(ch)} channel. Join it, come back, and tap the button below.</p>
  <div class="row"><button class="btn primary" id="join">Join ${esc(ch)}</button><button class="btn" id="joined">I've joined</button></div>`,el=>{
    el.querySelector('#join').addEventListener('click',()=>{const u='https://t.me/'+ch.replace(/^@/,'');if(tg&&tg.openTelegramLink)tg.openTelegramLink(u);else window.open(u,'_blank');});
    el.querySelector('#joined').addEventListener('click',startSession);});}
function openOutside(){openPanel(`<div class="eyebrow">Galaxyme</div><h3 class="ptitle">Open it in Telegram to mine</h3><p class="pm">Mining needs your Telegram account, so it only runs inside the Galaxyme bot. You can still look around the galaxy and the network here.</p>`);}

/* ---------- stars tab ---------- */
const FILTERS=[['all','All'],['main','Main sequence'],['giant','Giants'],['binary','Binaries'],['pulsar','Pulsars'],['hole','Black holes']];
let filter='all';
$('filters').innerHTML=FILTERS.map(([k,l])=>`<button class="chip" data-f="${k}" aria-pressed="${k==='all'}">${l}</button>`).join('');
$('filters').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;filter=b.dataset.f;for(const c of $('filters').children)c.setAttribute('aria-pressed',String(c===b));renderStars();});
let starsKey='';
function renderStars(){const list=[...mineSet].sort((a,b)=>b-a).map(h=>stars.get(h)).filter(s=>s&&s.cls!=='origin');
  const key=filter+':'+list.length;if(key===starsKey)return;starsKey=key;
  $('starCount').textContent=list.length+' found';
  const shown=list.filter(s=>filter==='all'||s.cls===filter).slice(0,240);const g=$('grid');g.innerHTML='';
  if(!list.length){g.innerHTML='<div class="empty" style="grid-column:1/-1"><b>No stars yet</b>Find a block and its star is yours for good. Most blocks give a main sequence star. About 1 in 1,024 collapses into a black hole.</div>';return;}
  if(!shown.length){g.innerHTML='<div class="empty" style="grid-column:1/-1"><b>None of these yet</b>'+(FILTERS.find(f=>f[0]===filter)[1])+' are rarer. Keep mining.</div>';return;}
  for(const s of shown){const t=document.createElement('button');t.className='tile';t.appendChild(thumb(s));t.insertAdjacentHTML('beforeend',`<span class="n">${esc(s.name)}</span><span class="d">${s.designation}</span>`);t.addEventListener('click',()=>{buzz('light');selected=s;openSheet(s,false);});g.appendChild(t);}}

/* ---------- network tab ---------- */
async function refreshNet(){const n=await api('/network');if(n&&n.height!=null){NET=n;renderNet();if(n.height>=chain.length)syncChain(true);}}
async function refreshMe(){if(!INIT)return;const m=await api('/me');if(m.me){setMe(m.me);CH=m.channel;REF=m.refLink;}}
function renderNet(){const n=NET;if(!n)return;
  $('k-height').textContent=fmt(n.height);$('k-rate').textContent=rateTxt(n.hashrate)||'0 H/s';$('k-active').textContent=fmt(n.active);$('k-reward').textContent=fmt(n.reward)+' ✦';
  $('roundT').textContent='Block #'+fmt(n.height+1)+' in progress';
  $('roundS').textContent=n.round.miners?`${n.round.miners} miner${n.round.miners>1?'s':''} sharing it · aiming for ~${Math.round(n.blockTarget/60)} min`:'Nobody is mining it right now';
  $('leaders').innerHTML=n.round.leaders.map(l=>`<div class="lead${l.you?' you':''}"><span class="ln">${esc(l.name)}${l.you?' <em>you</em>':''}</span><span class="lb"><i style="transform:scaleX(${Math.max(.02,l.pct).toFixed(3)})"></i></span><span class="lp num">${Math.round(l.pct*100)}%</span></div>`).join('');
  const bl=$('blocks');bl.innerHTML='';
  for(const b of n.blocks){const s=stars.get(b.height);const el=document.createElement('button');el.className='blk';
    el.innerHTML=`<span class="hgt">#${fmt(b.height)}</span><span class="nm">${s?esc(s.name):'…'} ${s?`<span class="tag"><i style="background:${CLASS_COLORS[s.cls]}"></i>${s.className}</span>`:''}</span><span class="when">${b.height===0?'genesis':ago(b.time)}</span><span class="hx">${b.height===0?'The first block':'found by <b>'+(b.mine?'you':esc(b.name))+'</b> · '+fmt(b.reward)+' ✦ to '+b.miners+' miner'+(b.miners>1?'s':'')}</span><span></span>`;
    el.addEventListener('click',()=>{const st=stars.get(b.height);if(st){selected=st;openSheet(st,false);}});bl.appendChild(el);}
  $('myRank').textContent=n.rank?'You are #'+n.rank:'';
  $('top').innerHTML=n.top.length?n.top.map((r,i)=>`<div class="rank${r.you?' you':''}"><span class="rn num">${i+1}</span><span class="rw"><b>${esc(r.name)}${r.you?' <em>you</em>':''}</b><small>${r.found} star${r.found===1?'':'s'} found</small></span><span class="rb num">${fmt(r.balance)} ✦</span></div>`).join(''):'<div class="empty"><b>No one yet</b>The first block fills this board.</div>';}
$('verify').addEventListener('click',()=>{const s=$('verifyS');s.className='s';s.textContent='Checking…';
  setTimeout(async()=>{await syncChain(false);const t0=performance.now();const r=verifyChain(chain);const ms=Math.round(performance.now()-t0);
    if(r.ok){s.className='s ok';s.textContent='All '+fmt(r.n)+' blocks check out · '+ms+' ms';buzz('success');}else{s.className='s bad';s.textContent='Problem at block #'+r.at+': '+r.why;}},30);});

/* ---------- nav ---------- */
let view='galaxy';
function show(v){view=v;
  for(const b of document.querySelectorAll('.nav button')){if(b.dataset.v===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  for(const id of ['galaxy','net','stars'])$('v-'+id).hidden=id!==v;skyOn=v==='galaxy';if(skyOn)resize();if(v==='net')refreshNet();}
document.querySelector('.nav').addEventListener('click',e=>{const b=e.target.closest('button');if(b){buzz('light');show(b.dataset.v);}});

/* ---------- boot ---------- */
if(tg){try{tg.ready();tg.expand();tg.setHeaderColor&&tg.setHeaderColor('#070816');tg.setBackgroundColor&&tg.setBackgroundColor('#070816');tg.disableVerticalSwipes&&tg.disableVerticalSwipes();}catch(_){}}
dust=buildDust();
new ResizeObserver(()=>{if(skyOn)resize();}).observe(sky);
resize();renderRig();requestAnimationFrame(frame);requestAnimationFrame(sheetLoop);
(async()=>{
  await Promise.all([syncChain(false),refreshMe(),refreshNet()]);
  if(chain.length>1){const s=stars.get(tip().height);cam.x=s.x*GR*.6;cam.y=s.y*GR*.6;}
  renderStars();renderRig();
  if(!INIT)openOutside();
  else if(state()==='mining')startSession();   // resume a session that is still running
})();
setInterval(()=>{renderRig();if(hashing&&ME&&serverNow()>ME.sessionEnd+2)endSession();},1000);
setInterval(()=>{if(!document.hidden)syncChain(true);},20000);
setInterval(()=>{if(!document.hidden&&(view==='net'||hashing))refreshNet();},12000);
setInterval(()=>{if(!document.hidden)refreshMe();},60000);
})();
