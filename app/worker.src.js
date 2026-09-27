// mining worker: expects makeMiner() from miner.js above
function below(o,t){const a=o[0]>>>0,b=o[1]>>>0;return a<t[0]||(a===t[0]&&b<t[1]);}
function hex(o){let s='';for(let i=0;i<8;i++)s+=(o[i]>>>0).toString(16).padStart(8,'0');return s;}
let job=null,running=false,looping=false,hashes=0,shares=0,last=0;
function flush(){postMessage({t:'p',h:hashes,s:shares});hashes=0;shares=0;last=performance.now();}
function run(){
  if(!running||!job){looping=false;return;}
  looping=true;const H=job.H,thr=job.thr,sthr=job.sthr,end=performance.now()+40;let n=job.n;
  outer:while(performance.now()<end){
    for(let i=0;i<1000;i++){
      const o=H(0,n);
      if(below(o,sthr)){shares++;
        if(below(o,thr)){hashes+=i+1;const found={t:'f',id:job.id,nonce:[0,n],hash:hex(o)};job=null;flush();postMessage(found);looping=false;return;}}
      n=(n+1)>>>0;
    }
    hashes+=1000;
  }
  job.n=n;
  if(performance.now()-last>250)flush();
  setTimeout(run,0);
}
onmessage=e=>{const m=e.data;
  if(m.cmd==='job'){job={id:m.id,H:makeMiner(new Uint8Array(m.header)),thr:m.thr,sthr:m.sthr,n:0};if(running&&!looping)run();}
  else if(m.cmd==='start'){running=true;if(!looping)run();}
  else if(m.cmd==='stop'){running=false;flush();}
};
