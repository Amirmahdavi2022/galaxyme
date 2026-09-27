// ---- chain + star core (shared by page and tests) ----
const ERA_BLOCKS=100000, BASE_REWARD=1000, SHARE_FACTOR=64;
function hexToBytes(h){const b=new Uint8Array(h.length/2);for(let i=0;i<b.length;i++)b[i]=parseInt(h.substr(i*2,2),16);return b;}
function wordsToHex(o){let s='';for(let i=0;i<8;i++)s+=(o[i]>>>0).toString(16).padStart(8,'0');return s;}
function hexToWords(h){const o=new Int32Array(8);for(let i=0;i<8;i++)o[i]=parseInt(h.substr(i*8,8),16)|0;return o;}
function sha32(words){const st=new Int32Array(IV),b=new Int32Array(16);for(let i=0;i<8;i++)b[i]=words[i];b[8]=0x80000000|0;b[15]=256;compress(st,b);return st;}
// threshold: floor(2^64 / E) as [hi,lo] unsigned words
function thrFor(E){const t=(1n<<64n)/BigInt(Math.max(1,Math.round(E)));const c=t>0xFFFFFFFFFFFFFFFFn?0xFFFFFFFFFFFFFFFFn:t;return [Number(c>>32n),Number(c&0xFFFFFFFFn)];}
function shareThr(E){return thrFor(Math.max(1,E/SHARE_FACTOR));}
function below(o,thr){const a=o[0]>>>0,b=o[1]>>>0;return a<thr[0]||(a===thr[0]&&b<thr[1]);}
// header layout (128 bytes): version4 height8 prev32 sharesRoot32 miner20 time8 target8 nonce16
function buildHeader(blk){const h=new Uint8Array(128),dv=new DataView(h.buffer);
  dv.setUint32(0,1);dv.setUint32(4,Math.floor(blk.height/4294967296));dv.setUint32(8,blk.height>>>0);
  h.set(hexToBytes(blk.prev),12);h.set(hexToBytes(blk.shares||'0'.repeat(64)),44);h.set(hexToBytes(blk.miner),76);
  dv.setUint32(96,Math.floor(blk.time/4294967296));dv.setUint32(100,blk.time>>>0);
  dv.setUint32(104,blk.thr[0]);dv.setUint32(108,blk.thr[1]);
  dv.setUint32(112,blk.xn[0]>>>0);dv.setUint32(116,blk.xn[1]>>>0);dv.setUint32(120,blk.nonce[0]>>>0);dv.setUint32(124,blk.nonce[1]>>>0);
  return h;}
function hashBlock(blk){const m=makeMiner(buildHeader(blk));return m(blk.nonce[0]|0,blk.nonce[1]|0);}
function rarityBits(o,thr){const top=(o[0]>>>0)*4294967296+(o[1]>>>0);const t=thr[0]*4294967296+thr[1];if(top<=0)return 40;return Math.max(0,Math.floor(Math.log2(t/top)));}
function verifyChain(blocks){for(let i=0;i<blocks.length;i++){const b=blocks[i];const o=hashBlock(b);const hx=wordsToHex(o);
  if(hx!==b.hash)return {ok:false,at:b.height,why:'hash mismatch'};if(!below(o,b.thr))return {ok:false,at:b.height,why:'above target'};
  if(i>0&&(b.prev!==blocks[i-1].hash||b.height!==blocks[i-1].height+1))return {ok:false,at:b.height,why:'broken link'};}
  return {ok:true,n:blocks.length};}
function rewardAt(h){return BASE_REWARD/Math.pow(2,Math.floor(h/ERA_BLOCKS));}

// ---- star from block ----
const CLASSES=[
 {id:'main',name:'Main sequence',min:0,max:2,odds:'7 in 8'},
 {id:'giant',name:'Giant',min:3,max:4,odds:'1 in 11'},
 {id:'binary',name:'Binary system',min:5,max:6,odds:'1 in 43'},
 {id:'pulsar',name:'Pulsar',min:7,max:9,odds:'1 in 146'},
 {id:'hole',name:'Black hole',min:10,max:999,odds:'1 in 1,024'}];
function classFor(k){return CLASSES.find(c=>k>=c.min&&k<=c.max);}
function prng(words){const s=new Uint32Array(4);for(let i=0;i<4;i++)s[i]=(words[i]^words[i+4])>>>0;if(!(s[0]|s[1]|s[2]|s[3]))s[0]=1;
  return function(){let t=s[3];const s0=s[0];s[3]=s[2];s[2]=s[1];s[1]=s0;t^=t<<11;t^=t>>>8;s[0]=(t^s0^(s0>>>19))>>>0;return s[0]/4294967296;};}
function tempColor(T){T=Math.min(40000,Math.max(1000,T))/100;let r,g,b;
  if(T<=66){r=255;g=99.4708025861*Math.log(T)-161.1195681661;}else{r=329.698727446*Math.pow(T-60,-0.1332047592);g=288.1221695283*Math.pow(T-60,-0.0755148492);}
  if(T>=66)b=255;else if(T<=19)b=0;else b=138.5177312231*Math.log(T-10)-305.0447927307;
  const c=v=>Math.round(Math.min(255,Math.max(0,v)));return [c(r),c(g),c(b)];}
const ON=['v','k','th','s','r','n','l','m','z','dr','kr','ph','t','y','h','qu','sel','ar','or'],VO=['a','e','i','o','u','ae','ai','y','io','ea','ei'],CO=['','','','n','r','s','th','x','l','nd'];
const PLANET_TONES=[[196,120,84],[214,176,122],[120,160,214],[150,200,190],[210,140,170],[170,150,120],[230,210,170],[110,130,170]];
function starFrom(blk){
  const words=hexToWords(blk.hash);const seed=sha32(words);const R=prng(seed);
  const k=blk.height===0?-1:rarityBits(words,blk.thr);const cls=blk.height===0?{id:'origin',name:'Origin',odds:'one of one'}:classFor(k);
  let nm='';const syl=2+(R()<0.35?1:0);for(let i=0;i<syl;i++){nm+=ON[Math.floor(R()*ON.length)]+VO[Math.floor(R()*VO.length)]+(i===syl-1?CO[Math.floor(R()*CO.length)]:'');}
  nm=nm[0].toUpperCase()+nm.slice(1);if(blk.height===0)nm='Origin';
  const s={name:nm,designation:'GX-'+String(blk.height).padStart(6,'0'),cls:cls.id,className:cls.name,odds:cls.odds,k,height:blk.height};
  let T,T2=null,mass=null,period=null,radius,nPl;
  const r=R();
  switch(cls.id){
    case 'main':T=2700+9500*Math.pow(r,2.2);radius=Math.pow(T/5800,1.25)*(0.8+0.4*R());nPl=[0,1,2,3,4,5,6,7,8][Math.floor(Math.pow(R(),1.6)*9)];break;
    case 'giant':if(r<0.6){T=3300+1400*R();s.className='Red giant';}else{T=12000+18000*R();s.className='Blue giant';}radius=10+190*R();nPl=Math.floor(Math.pow(R(),1.5)*5);break;
    case 'binary':T=3000+8000*R();T2=2800+7000*R();radius=Math.pow(T/5800,1.25);nPl=Math.floor(R()*4);break;
    case 'pulsar':T=400000+600000*R();period=Math.round((1.4+Math.pow(R(),2)*900)*10)/10;radius=0.000015;nPl=R()<0.2?1:0;break;
    case 'hole':mass=Math.round((5+55*R())*10)/10;T=null;radius=null;nPl=0;break;
    default:T=5772;radius=1;nPl=3;}
  s.temp=T;s.temp2=T2;s.mass=mass;s.period=period;s.radius=radius;
  s.color=cls.id==='pulsar'?[205,225,255]:cls.id==='hole'?[255,170,90]:tempColor(T);s.color2=T2?tempColor(T2):null;
  s.planets=[];for(let i=0;i<nPl;i++){const tone=PLANET_TONES[Math.floor(R()*PLANET_TONES.length)];s.planets.push({orbit:0.34+i*0.085+R()*0.03,size:2+R()*4.5,tone,ring:R()<0.22,phase:R()*Math.PI*2,speed:0.35/Math.pow(0.34+i*0.09,1.5),moons:Math.floor(Math.pow(R(),2)*4)});}
  // galaxy position (unit disc)
  const era=Math.floor(blk.height/ERA_BLOCKS),arm=era%4;const t=blk.height===0?0:Math.log(1+(blk.height%ERA_BLOCKS||ERA_BLOCKS))/Math.log(1+ERA_BLOCKS);
  const ang=arm*Math.PI/2+t*2.6*Math.PI+(R()-0.5)*0.3;const rad=blk.height===0?0:0.07+0.88*t+(R()-0.5)*0.05;
  s.x=Math.cos(ang)*rad;s.y=Math.sin(ang)*rad;s.twinkle=R()*Math.PI*2;
  return s;}
if(typeof module!=='undefined')module.exports={thrFor,shareThr,below,buildHeader,hashBlock,rarityBits,verifyChain,starFrom,wordsToHex,hexToWords,sha32,rewardAt,CLASSES,classFor,makeMiner};
