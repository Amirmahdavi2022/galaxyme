// double SHA-256 over a 128-byte header, nonce = last 16 bytes (words 12..15 of block 2)
const K=new Int32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const IV=new Int32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
const W=new Int32Array(64);
function compress(st,blk){ // st: Int32Array(8) in/out, blk: Int32Array(16)
  for(let i=0;i<16;i++)W[i]=blk[i];
  for(let i=16;i<64;i++){const a=W[i-15],b=W[i-2];
    const s0=((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3);
    const s1=((b>>>17)|(b<<15))^((b>>>19)|(b<<13))^(b>>>10);
    W[i]=(W[i-16]+s0+W[i-7]+s1)|0;}
  let a=st[0],b=st[1],c=st[2],d=st[3],e=st[4],f=st[5],g=st[6],h=st[7];
  for(let i=0;i<64;i++){
    const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
    const t1=(h+S1+((e&f)^(~e&g))+K[i]+W[i])|0;
    const S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
    const t2=(S0+((a&b)^(a&c)^(b&c)))|0;
    h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
  st[0]=(st[0]+a)|0;st[1]=(st[1]+b)|0;st[2]=(st[2]+c)|0;st[3]=(st[3]+d)|0;
  st[4]=(st[4]+e)|0;st[5]=(st[5]+f)|0;st[6]=(st[6]+g)|0;st[7]=(st[7]+h)|0;
}
// header: Uint8Array(128). returns object able to hash with a 64-bit nonce (words 14,15)
function makeMiner(header){
  const dv=new DataView(header.buffer,header.byteOffset,128);
  const b1=new Int32Array(16),b2=new Int32Array(16);
  for(let i=0;i<16;i++){b1[i]=dv.getInt32(i*4);b2[i]=dv.getInt32(64+i*4);}
  const mid=new Int32Array(IV);compress(mid,b1);
  const pad=new Int32Array(16);pad[0]=0x80000000|0;pad[15]=1024;
  const st=new Int32Array(8),blk3=new Int32Array(16);blk3[8]=0x80000000|0;blk3[15]=256;
  const out=new Int32Array(8);
  return function hash(nHi,nLo){ // sets nonce words 14,15; result in out (big-endian words)
    b2[14]=nHi;b2[15]=nLo;
    st.set(mid);compress(st,b2);compress(st,pad);
    for(let i=0;i<8;i++)blk3[i]=st[i];
    out.set(IV);compress(out,blk3);
    return out;
  };
}
function lzBits(out){let n=0;for(let i=0;i<8;i++){const w=out[i]>>>0;if(w===0){n+=32;continue;}return n+Math.clz32(w);}return n;}
