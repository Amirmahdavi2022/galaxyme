// mining worker: expects makeMiner() from miner.js above.
// Hashes the current job and reports every share (hash below the share target) to the page.
function below(o,t){const a=o[0]>>>0,b=o[1]>>>0;return a<t[0]||(a===t[0]&&b<t[1]);}
let job=null,running=false,looping=false,hashes=0,last=0;
function flush(){postMessage({t:'p',h:hashes});hashes=0;last=performance.now();}
function run(){
  if(!running||!job){looping=false;return;}
  looping=true;const j=job,H=j.H,sthr=j.sthr,end=performance.now()+40;let n=j.n;
  while(performance.now()<end){
    for(let i=0;i<1000;i++){
      const o=H(0,n);
      if(below(o,sthr))postMessage({t:'s',id:j.id,nonce:[0,n]});
      n=(n+1)>>>0;
    }
    hashes+=1000;
  }
  j.n=n;
  if(performance.now()-last>250)flush();
  setTimeout(run,0);
}
onmessage=e=>{const m=e.data;
  if(m.cmd==='job'){job={id:m.id,H:makeMiner(new Uint8Array(m.header)),sthr:m.sthr,n:0};if(running&&!looping)run();}
  else if(m.cmd==='start'){running=true;if(!looping)run();}
  else if(m.cmd==='stop'){running=false;job=null;flush();}
};
