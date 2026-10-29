// 사진 인식 시험: 실제 사이트(camterior.github.io) 탭의 콘솔에서 실행
// 시험지 1) 장비 제원 사진 한 장씩 → 그 장비를 맞히는지
// 시험지 2) 장비 사진 3~4장을 한 장에 모은 '세팅 사진' → 모두 맞히고 엉뚱한 건 안 넣는지
// 사용: await photoEval({acct:'내 코드', singles:80, combos:20, wait:4500})  → 결과는 window.PE
async function photoEval(o={}){
  const acct=o.acct||acctCode(),wait=o.wait??4500,sleep=t=>new Promise(r=>setTimeout(r,t));
  const all=mineAll().filter(x=>x.k!=='tent'&&GEAR_ART.has(x.id));
  const load=src=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src;});
  const jpg=(c)=>c.toDataURL('image/jpeg',.82).split(',')[1];
  async function single(it){const im=await load(`img/gear/${it.id}.webp`);const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);return jpg(c);}
  async function combo(items){const ims=await Promise.all(items.map(it=>load(`img/gear/${it.id}.webp`)));const W=640,H=480,cols=2,rows=Math.ceil(ims.length/2);
    const c=document.createElement('canvas');c.width=W*cols;c.height=H*rows;const g=c.getContext('2d');g.fillStyle='#EFE6D6';g.fillRect(0,0,c.width,c.height);
    ims.forEach((im,i)=>g.drawImage(im,(i%cols)*W,Math.floor(i/cols)*H,W,H));return jpg(c);}
  async function ask(data){const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:mineSystem(),prompt:'이 사진 속 캠핑 장비를 찾아줘',image:{mime:'image/jpeg',data},acct})});
    const d=await r.json().catch(()=>({}));if(!r.ok||!d.text)return {err:d.error||r.status};
    try{const j=JSON.parse(d.text.replace(/^```(json)?|```$/g,'').trim());return {found:(j.found||[]).filter(x=>x&&(!Array.isArray(j.seen)||!j.seen.length||x.why)).map(x=>String(x.key)),unknown:j.unknown||[],seen:j.seen||[]};}catch(e){return {err:'json'};}}
  const rnd=(a,n,seed)=>{const b=a.slice();let s=seed;for(let i=b.length-1;i>0;i--){s=(s*9301+49297)%233280;const j=Math.floor(s/233280*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b.slice(0,n);};
  const PE=window.PE={singles:[],combos:[]};
  for(const it of all.slice(0,o.singles??all.length)){const r=await ask(await single(it));
    PE.singles.push({key:it.key,name:it.name,ok:!!(r.found&&r.found.includes(it.key)),extra:(r.found||[]).filter(k=>k!==it.key),...r});console.log('1장',PE.singles.length,it.name,PE.singles.at(-1).ok?'O':'X',r.found||r.err);await sleep(wait);}
  for(let n=0;n<(o.combos??0);n++){const items=rnd(all,3+(n%2),n*7+3);const r=await ask(await combo(items));const want=items.map(x=>x.key);
    const hit=want.filter(k=>(r.found||[]).includes(k)),extra=(r.found||[]).filter(k=>!want.includes(k));
    PE.combos.push({want,hit,extra,...r});console.log('세팅',n+1,`${hit.length}/${want.length}`,'엉뚱',extra.length,r.err||'');await sleep(wait);}
  const s=PE.singles,c=PE.combos;
  PE.score={single:`${s.filter(x=>x.ok).length}/${s.length}`,singleExtra:s.reduce((a,x)=>a+x.extra.length,0),
    combo:`${c.reduce((a,x)=>a+x.hit.length,0)}/${c.reduce((a,x)=>a+x.want.length,0)}`,comboExtra:c.reduce((a,x)=>a+x.extra.length,0),err:[...s,...c].filter(x=>x.err).length};
  console.log('점수',PE.score);return PE.score;}
