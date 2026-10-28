/* =====================================================================
   캠테리어 AI 세팅 추천 (1단계: 장비 글 → 자동 배치)
   - 사용자가 적은 장비·위치 설명을 AI(Gemini, Cloudflare 중계)가 카탈로그 id로 바꿔줌
   - 실제 자리 잡기는 여기 코드가 함 (텐트 안·이너룸·출입구·겹침 검사, IGT에 멀티펑션 결합)
   - AI가 막히면(무료 한도 등) 이름 맞추기로 바로 배치
   ===================================================================== */
const AI_URL='https://camterior-ai.ghdwnd2.workers.dev';
const AI_ROOTS=['reg3','long4','sep2','sep3','sep4'];
const AI_EXTS=['mf_reg','mf_long','open_L','open_R','corner_L','corner_R','slide_h','slide_hl'];
const AI_SLOTS=SLOT_ITEMS.map(t=>t.id);
const aiSlotName=id=>getItem(id).name;
const AI_ZONES=['wall','center','inner','left','right','top','bottom'];
const AI_MAX_EACH=6,AI_MAX_TOTAL=24;
// 사람들이 흔히 부르는 이름 (AI 안내 + 이름 맞추기 둘 다 씀)
const AI_ALIAS={reg3:['IGT 3유닛','IGT 프레임 3유닛','아이지티 3유닛'],long4:['IGT 롱','IGT 4유닛','IGT 프레임 롱'],
  sep2:['세퍼레이트 2유닛','세퍼레이트 하프'],sep3:['세퍼레이트 3유닛','세퍼레이트 레귤러','세퍼레이트 IGT'],sep4:['세퍼레이트 4유닛','세퍼레이트 롱'],
  mf_reg:['멀티펑션','멀티펑션 테이블'],slide_h:['하프슬라이드','슬라이드하프','슬라이드 트레이'],slide_hl:['하프슬라이드 롱','슬라이드하프롱'],
  mytable_s:['스텐 마이테이블','스탠 마이테이블','스텐마이테이블','스탠마이테이블','스테인리스 마이테이블'],
  flat:['플랫버너'],sp_jikaro:['지카로','지카로테이블','지카로 테이블','ST-050'],sp_gs1000:['강염버너','강염스토브','GS-1000','스노우피크 강염'],seppou:['설봉','그릴버너'],steel1:['원유닛 트레이','1유닛 트레이','스텐트레이','스텐 트레이','스탠트레이'],lid_half:['리드트레이'],box_half:['스텐박스'],
  wood_s:['우드테이블 S','우드 S'],wood_w:['우드테이블 W','우드 W'],mesh_d1:['메쉬트레이 딥'],mesh_s1:['메쉬트레이'],mf_long:['멀티펑션 롱','멀티펑션롱'],open_L:['오픈멀티펑션 L'],open_R:['오픈멀티펑션 R'],corner_L:['코너테이블 L'],corner_R:['코너테이블 R'],
  sp_fd:['FD체어','에프디체어'],hx_one:['체어원','헬리녹스 체어원','헬리녹스체어원'],hx_zero:['체어제로','헬리녹스 체어제로'],omni230:['옴니','옴니230'],camp5000:['파세코 팬히터','캠프5000','파세코'],mk_stove:['MK스토브','화목난로','장작난로'],toyotomi_lcl53:['토요토미 팬히터','LC-L53'],sfh_bh900:['신일 900','신일 팬히터 900'],sfh1200:['신일 1200','신일 팬히터 1200'],cfx3_35:['도메틱 35','CFX3 35'],cfx3_45:['도메틱 45','CFX3 45'],cfx3_55:['도메틱 55','CFX3 55'],
  megamat_duo:['메가매트 듀오'],megamat:['메가매트'],cot_one:['코트원'],sp_oat_low:['원액션 로우'],sp_oat:['원액션테이블'],
  merak_pro:['메락'],landlock:['랜드락'],living_shell_long_pro:['리빙쉘 롱 프로','리빙쉘롱'],living_shell:['리빙쉘']};
const aiTentName=id=>{const T=TENTS[id];return ((T.brand?T.brand+' ':'')+T.name).trim();};
const aiIds=()=>AI_ROOTS.concat(GEAR_ORDER).filter(id=>CATALOG[id]);
const aiEsc=s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const aiAl=id=>AI_ALIAS[id]?' (='+AI_ALIAS[id].join(', ')+')':'';

function aiZone(id){const c=CATALOG[id];
  if(c.sleep||c.gtype==='mat'||c.gtype==='cot')return 'inner';
  if(c.kind==='frame'||['shelf','box','fridge'].includes(c.gtype)||c.group==='알루미늄 박스'||id==='sp_kitchen')return 'wall';
  return 'center';}

// 사진 속 실제 배치를 옮긴 대본 50개 중 대표 20개 (count 1은 생략). 전체 50개는 scripts/ai-scripts50.json 시험용
const AI_EXAMPLES=[["랜드록 안에 IGT 롱 하나 벽쪽에 두고 양쪽 끝에 코너테이블 L이랑 R 붙여줘. 칸에는 설봉원, 플랫버너, 우드테이블 W 넣고 다리는 660. 가운데에 원액션테이블 롱 하나, FD체어 4개, 옆에 강염버너 하나.",{"tent":"landlock","items":[{"type":"long4","zone":"wall","attach":[{"type":"corner_L","shape":"line"},{"type":"corner_R","shape":"line"}],"slots":[{"id":"seppou","count":1},{"id":"flat","count":1},{"id":"wood_w","count":1}],"leg":660},{"type":"sp_oat_l","zone":"center"},{"type":"sp_fd","count":4,"zone":"center"},{"type":"sp_gs1000","zone":"center"}],"unknown":[],"tip":"IGT 롱 8칸이 설봉원·플랫버너·우드테이블 W로 꽉 차요. 강염버너는 텐트 벽에서 떨어뜨려 두세요."}],["리빙쉘 롱 프로에 원액션 로우테이블 2개 가운데 두고 로우체어 30 두 개, 강염버너 하나. 벽쪽엔 쉘프컨테이너 50, 이너룸엔 메가매트 듀오. 육각 테이블도 있어.",{"tent":"living_shell_long_pro","items":[{"type":"sp_oat_low","count":2,"zone":"center"},{"type":"sp_low30","count":2,"zone":"center"},{"type":"sp_gs1000","zone":"center"},{"type":"sc50","zone":"wall"},{"type":"megamat_duo","zone":"inner"}],"unknown":["육각 테이블"],"tip":"로우테이블 높이에 맞춰 로우체어 30을 붙였어요. 육각 테이블은 아직 제원에 없어서 뺐어요."}],["쉘터GM 앞쪽에 세퍼레이트 IGT, 칸에 설봉원이랑 플랫버너 넣고 앞에 멀티펑션 롱 T자로. 뒤쪽으로 원액션테이블 롱 하나랑 FD체어 2개.",{"tent":"mw_shelter_gm","items":[{"type":"sep3","zone":"bottom","attach":[{"type":"mf_long","shape":"T"}],"slots":[{"id":"seppou","count":1},{"id":"flat","count":1}]},{"type":"sp_oat_l","zone":"top"},{"type":"sp_fd","count":2,"zone":"top"}],"unknown":[],"tip":"요리하는 IGT는 입구 쪽, 식탁은 안쪽에 두면 연기가 밖으로 잘 빠져요."}],["카즈미 비바돔 플러스에 마운틴리버 야전침대 하나, 헬리녹스 선셋체어, 스텐 마이테이블, 강염버너.",{"tent":null,"items":[{"type":"hx_sunset","zone":"center"},{"type":"mytable_s","zone":"center"},{"type":"sp_gs1000","zone":"center"}],"unknown":["카즈미 비바돔 플러스","마운틴리버 야전침대"],"tip":"비바돔 플러스와 마운틴리버 야전침대는 아직 제원에 없어서 뺐어요."}],["메락 프로 가운데 지카로 테이블 두고 로우체어 쇼트 4개 둘러앉게, 벽쪽엔 IGT 롱에 코너테이블 L 붙이고 플랫버너, 설봉원. 코트원 하나 벽쪽.",{"tent":"merak_pro","items":[{"type":"sp_jikaro","zone":"center"},{"type":"sp_lowshort","count":4,"zone":"center"},{"type":"long4","zone":"wall","attach":[{"type":"corner_L","shape":"line"}],"slots":[{"id":"flat","count":1},{"id":"seppou","count":1}]},{"type":"cot_one","zone":"wall"}],"unknown":[],"tip":"지카로 테이블 둘레로 앉고, 주방 IGT는 벽쪽에 붙여 가운데 길을 비웠어요."}],["쉘터GM에 세퍼레이트 3유닛에 플랫버너, 설봉원, 원유닛 트레이 하나. 하프슬라이드 하나 붙이고 FD체어 2개 IGT 앞에 앉게.",{"tent":"mw_shelter_gm","items":[{"type":"sep3","zone":"wall","attach":[{"type":"slide_h","shape":"line"}],"slots":[{"id":"flat","count":1},{"id":"seppou","count":1},{"id":"steel1","count":1}]},{"type":"sp_fd","count":2,"zone":"center"}],"unknown":[],"tip":"버너 앞이라 의자는 IGT에서 한 뼘 띄웠어요."}],["메락 프로에 IGT 롱, 칸엔 플랫버너 설봉원 우드테이블 W. 앞에 노가체어 3개 쭉 앉게.",{"tent":"merak_pro","items":[{"type":"long4","zone":"wall","slots":[{"id":"flat","count":1},{"id":"seppou","count":1},{"id":"wood_w","count":1}]},{"type":"noga_chair","count":3,"zone":"center","at":"long4"}],"unknown":[],"tip":"IGT 앞 바 자리예요. 버너 앞이라 의자를 한 뼘 띄웠어요."}],["미니멀웍스 쉘터g 에어에 스탠마이테이블 2개랑 헬리녹스체어원 2개",{"tent":"mw_shelter_gair","items":[{"type":"mytable_s","count":2,"zone":"center"},{"type":"hx_one","count":2,"zone":"center"}],"unknown":[],"tip":""}],["쉘터GM에 원액션 로우테이블, FD체어 2개, 이백 아이스박스, 크레모아 랜턴, 우드랙",{"tent":"mw_shelter_gm","items":[{"type":"sp_oat_low","zone":"center"},{"type":"sp_fd","count":2,"zone":"center"}],"unknown":["이백 아이스박스","크레모아 랜턴","우드랙"],"tip":"아이스박스·랜턴·우드랙은 아직 제원에 없어서 뺐어요."}],["쿠디 파밀리아 프로에 IGT 롱 벽쪽, 양쪽 끝에 코너테이블 L R, 앞에 멀티펑션 롱 T자. 칸은 플랫버너, 설봉원, 스텐트레이, 우드테이블 S. 원액션테이블 롱에 테이크체어 4개, FD체어 2개는 멀티펑션 쪽.",{"tent":"cd_familia_pro","items":[{"type":"long4","zone":"wall","attach":[{"type":"corner_L","shape":"line"},{"type":"corner_R","shape":"line"},{"type":"mf_long","shape":"T"}],"slots":[{"id":"flat","count":1},{"id":"seppou","count":1},{"id":"steel1","count":1},{"id":"wood_s","count":1}]},{"type":"sp_oat_l","zone":"center"},{"type":"sp_take","count":4,"zone":"center"},{"type":"sp_fd","count":2,"zone":"center","at":"long4"}],"unknown":[],"tip":"6명 자리예요. 멀티펑션 쪽은 요리하며 먹는 자리, 원액션테이블은 식탁이에요."}],["랜드브리즈 4에 IGT 레귤러 다리 830, 플랫버너 스텐트레이 두 개. 원액션테이블 하이에 FD체어 2개.",{"tent":"sp_landbreeze4","items":[{"type":"reg3","zone":"wall","slots":[{"id":"flat","count":1},{"id":"steel1","count":2}],"leg":830},{"type":"sp_oat","zone":"center"},{"type":"sp_fd","count":2,"zone":"center"}],"unknown":[],"tip":"830 다리는 서서 요리하는 높이예요."}],["리빙쉘에 알루텍 93 두 개, 알루텍 68 하나, 쉘프컨테이너 25 두 개 다 벽쪽, 폴딩쉘프 메탈탑 하나.",{"tent":"living_shell","items":[{"type":"alu93","count":2,"zone":"wall"},{"type":"alu68","zone":"wall"},{"type":"sc25","count":2,"zone":"wall"},{"type":"fshelf_m","zone":"wall"}],"unknown":[],"tip":"수납은 벽을 따라 붙여 가운데를 비웠어요."}],["랜드네스트 쉘터에 IGT 레귤러, 오픈멀티펑션 L이랑 R 양쪽에. 칸은 플랫버너, 스텐트레이, 리드트레이, 스텐박스. 로우체어 쇼트 4개.",{"tent":"sp_landnest","items":[{"type":"reg3","zone":"wall","attach":[{"type":"open_L","shape":"line"},{"type":"open_R","shape":"line"}],"slots":[{"id":"flat","count":1},{"id":"steel1","count":1},{"id":"lid_half","count":1},{"id":"box_half","count":1}]},{"type":"sp_lowshort","count":4,"zone":"center"}],"unknown":[],"tip":""}],["콜맨 웨더마스터 와이드 2룸 코쿤 IV에 원액션테이블 롱, FD체어 4개.",{"tent":null,"items":[{"type":"sp_oat_l","zone":"center"},{"type":"sp_fd","count":4,"zone":"center"}],"unknown":["콜맨 웨더마스터 와이드 2룸 코쿤 IV"],"tip":"코쿤 IV는 아직 제원에 없어요. 비슷한 모델로 바꾸지 않았어요."}],["IGT 레귤러에 플랫버너 2개랑 스텐트레이 하나. 원액션 로우테이블, 로우체어 30 2개.",{"tent":null,"items":[{"type":"reg3","zone":"wall","slots":[{"id":"flat","count":2},{"id":"steel1","count":1}]},{"type":"sp_oat_low","zone":"center"},{"type":"sp_low30","count":2,"zone":"center"}],"unknown":[],"tip":""}],["쿠디 10.0에 냉장고 도메틱 45는 오른쪽 끝, 쉘프컨테이너 50은 왼쪽, 가운데 원액션테이블 롱에 FD체어 4개.",{"tent":"cd_100","items":[{"type":"cfx3_45","zone":"right"},{"type":"sc50","zone":"left"},{"type":"sp_oat_l","zone":"center"},{"type":"sp_fd","count":4,"zone":"center"}],"unknown":[],"tip":""}],["FD체어x4, 원액션테이블롱x1, 랜드록",{"tent":"landlock","items":[{"type":"sp_fd","count":4,"zone":"center"},{"type":"sp_oat_l","zone":"center"}],"unknown":[],"tip":""}],["리빙쉘 롱 프로, IGT 롱에 플랫버너 설봉원 우드테이블 W, IGT 앞엔 노가체어 2개. 원액션 로우테이블엔 로우체어 30 2개.",{"tent":"living_shell_long_pro","items":[{"type":"long4","zone":"wall","slots":[{"id":"flat","count":1},{"id":"seppou","count":1},{"id":"wood_w","count":1}]},{"type":"noga_chair","count":2,"zone":"center","at":"long4"},{"type":"sp_oat_low","zone":"center"},{"type":"sp_low30","count":2,"zone":"center","at":"sp_oat_low"}],"unknown":[],"tip":"요리 바와 낮은 거실을 나눴어요."}],["어메니티돔 M 이너룸에 스패로우 그랜드50, 거실엔 헬리녹스 테이블원에 체어원 2개.",{"tent":"sp_amenity_m","items":[{"type":"sparrow50","zone":"inner"},{"type":"hx_t1","zone":"center"},{"type":"hx_one","count":2,"zone":"center"}],"unknown":[],"tip":""}],["도쿄크래프트 윙 아래 IGT 레귤러 플랫버너, 원액션테이블 롱, 커밋체어 4개.",{"tent":"tc_wing","items":[{"type":"reg3","zone":"wall","slots":[{"id":"flat","count":1}]},{"type":"sp_oat_l","zone":"center"},{"type":"kermit","count":4,"zone":"center"}],"unknown":[],"tip":""}]];
// AI 중계 서버가 지시문을 8000자에서 자르므로, 텐트는 글에 나온 후보만, 예시는 글과 비슷한 것부터 남는 자리만큼 넣음
const AI_SYS_MAX=7800;
const aiWords=t=>new Set(String(t).toLowerCase().split(/[\s,.·/()]+/).filter(w=>w.length>=2));
function aiTentCands(text){const t=aiNorm(text),sc={};
  TENT_ORDER.filter(id=>id!=='none').forEach(id=>{const T=TENTS[id],nm=aiNorm(T.name);let v=0;
    if(nm.length>=2&&t.includes(nm))v+=nm.length*3;
    const br=T.brand&&t.includes(aiNorm(T.brand));String(T.name).split(/\s+/).map(aiNorm).filter(w=>!/^[\d.]+$/.test(w)&&(/^[a-z]+$/.test(w)?w.length>=3:w.length>=(br?1:2))).forEach(w=>{if(t.includes(w))v+=w.length;});
    (AI_ALIAS[id]||[]).map(aiNorm).forEach(a=>{if(a.length>=2&&t.includes(a))v+=a.length*3;});
    const m=aiNorm(T.model||'');if(m.length>=4&&t.includes(m))v+=m.length*2;
    if(v&&br)v+=2;if(v)sc[id]=v;});
  return Object.entries(sc).sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0]);}
function aiSystem(text=''){
  const tents=aiTentCands(text).map(id=>`${id}|${aiTentName(id)}${aiAl(id)}`).join('\n')||'(글에서 찾은 텐트 없음)';
  const gear=aiIds().map(id=>`${id}|${CATALOG[id].name}${aiAl(id)}`).join('\n');
  const ext=AI_EXTS.map(id=>`${id}|${CATALOG[id].name}${aiAl(id)}`).join('\n');
  const slots=SLOT_ITEMS.map(t=>`${t.id}|${t.name}|${t.halves/2}유닛${aiAl(t.id)}`).join('\n');
  const head=`너는 캠핑 텐트 안 배치 도우미야. 사용자 글에서 장비와 원하는 위치를 읽고 아래 목록의 id로만 바꿔.
JSON만 출력: {"tent":"텐트 id 또는 null","items":[{"type":"장비 id","count":1,"zone":"wall|center|inner|left|right|top|bottom","attach":[{"type":"결합 id","shape":"T|line"}],"slots":[{"id":"칸 파츠 id","count":1}],"leg":660,"at":"(체어만) 앉을 테이블·IGT id"}],"unknown":["목록에 없는 장비"],"tip":"배치 팁 한두 문장(한국어, 존댓말)"}
규칙:
- 사용자 글에 없는 장비는 절대 추가하지 마. 띄어쓰기·오타가 있어도 (=별칭)을 보고 맞춰 (예: 스탠마이테이블=mytable_s).
- '테이블','의자','버너'처럼 브랜드·모델 없는 일반 이름은 아무 제품으로 바꾸지 말고 unknown에.
- 수량이 없으면 1. 같은 id는 count로 합쳐. 목록에 없으면 unknown에 원래 이름 그대로.
- zone: 사용자가 말한 위치를 따름. 가운데/중앙=center, 벽쪽=wall, 오른쪽(끝)=right, 왼쪽=left, 위쪽/뒤쪽=top, 아래쪽/앞쪽=bottom, 이너룸/침실=inner. 말이 없으면 매트·코트=inner, IGT·선반·박스=wall, 체어·테이블·난로=center.
- [결합] 목록의 멀티펑션·코너·오픈멀티펑션은 혼자 두지 말고 IGT 프레임 항목의 attach에 넣어. IGT 앞(긴 변)에 붙여 앞으로 내면 shape "T"(T자/앞에 붙여), 일자로 길게 이으면(IGT 끝에 연결) "line". 말이 없으면 "line". IGT를 말하지 않았으면 reg3을 하나 만들어 붙여.
- [IGT 칸] 목록(버너·트레이·상판·수납)은 장비가 아니라 IGT 프레임 칸에 끼우는 파츠라 IGT 항목의 slots에 넣어. 슬라이드 트레이는 attach(shape line).
- leg: IGT 다리 높이(300/400/660/830)를 말하면 IGT 항목에 넣어. 없으면 생략.
- 의자는 따로 흩어 두지 않아. 코드가 테이블(없으면 IGT 앞) 둘레에 앉혀 주니까 체어는 zone을 비우거나 center로.
- 동선: 요리(IGT)는 벽쪽, 식탁 세트는 그 앞, 출입구에서 이너룸까지 길은 비워. tip에 이런 동선 팁을 짧게.
- 텐트를 말하지 않으면 null. [텐트] 후보에 없는 텐트면 비슷한 모델로 바꾸지 말고 null + unknown에 이름.
[텐트 후보]
${tents}
[장비]
${gear}
[결합]
${ext}
[IGT 칸]
${slots}
[예시] 입력 → 출력 (count 없으면 1)
`;
  const W=aiWords(text),rank=AI_EXAMPLES.map(e=>[e,[...aiWords(e[0])].filter(w=>W.has(w)).length]).sort((a,b)=>b[1]-a[1]);
  let out=head;for(const [[q,o]] of rank){const line=q+' → '+JSON.stringify(o)+'\n';if(out.length+line.length>AI_SYS_MAX)continue;out+=line;}
  return out;}

/* --- AI 없이: 이름 맞추기 --- */
const aiNorm=s=>String(s).toLowerCase().replace(/[\s·×x\-_,./()]+/g,'');
function aiKeys(ids,nameOf,modelOf){const own={},map={};
  ids.forEach(id=>{const nm=nameOf(id),w=nm.split(/\s+/);own[aiNorm(nm)]=id;
    const ks=new Set([aiNorm(modelOf(id)||'')]);(AI_ALIAS[id]||[]).forEach(a=>{const k=aiNorm(a);own[k]=id;ks.add(k);});
    for(let a=0;a<Math.min(2,w.length);a++)for(let b=w.length;b>a;b--)ks.add(aiNorm(w.slice(a,b).join(' ')));
    ks.forEach(k=>{if(k.length<2)return;(map[k]=map[k]||new Set()).add(id);});});
  return Object.entries(map).map(([k,s])=>own[k]?[own[k],k]:s.size===1?[[...s][0],k]:null).filter(Boolean).sort((a,b)=>b[1].length-a[1].length);}
function aiLocal(text){
  let t=aiNorm(text.replace(/[x×*]\s*(\d)/gi,'$1'));
  const res={tent:null,items:[],unknown:[],tip:''};
  const tid=TENT_ORDER.filter(id=>id!=='none');
  for(const [id,n] of aiKeys(tid,id=>TENTS[id].name,id=>TENTS[id].model)){if(n.length>=2&&t.includes(n)){res.tent=id;t=t.replace(n,'#');break;}}
  const cnt={},ext=[],pos={};
  const slotCnt={};
  for(const [id,n] of aiKeys(aiIds().concat(AI_EXTS,AI_SLOTS),id=>CATALOG[id]?CATALOG[id].name:aiSlotName(id),id=>CATALOG[id]?CATALOG[id].model:getItem(id).model)){let i;
    while((i=t.indexOf(n))>=0){const m=t.slice(i+n.length).match(/^(\d+)(개|장|대|ea)?/);const k=m?Math.max(1,+m[1]):1;
      if(pos[id]==null)pos[id]=i;t=t.slice(0,i)+'#'.repeat(n.length)+t.slice(i+n.length+(m?m[0].length:0));
      if(AI_SLOTS.includes(id))slotCnt[id]=(slotCnt[id]||0)+k;else if(AI_EXTS.includes(id)){for(let q=0;q<k;q++)ext.push(id);}else cnt[id]=(cnt[id]||0)+k;}}
  // 위치 말: 장비 이름 바로 앞뒤 12자 안의 방향어
  const raw=aiNorm(text),zoneOf=id=>{const i=pos[id];if(i==null)return null;const near=raw.slice(Math.max(0,i-12),i+20);
    return /오른쪽/.test(near)?'right':/왼쪽/.test(near)?'left':/(중앙|가운데)/.test(near)?'center':/벽/.test(near)?'wall':null;};
  const tshape=/t(모양|자)/.test(raw)?'T':'line',legM=raw.match(/(300|400|660|830)/);
  res.items=Object.entries(cnt).map(([type,count])=>({type,count,zone:zoneOf(type)}));
  if(ext.length||Object.keys(slotCnt).length){let f=res.items.find(it=>AI_ROOTS.includes(it.type));if(!f){f={type:'reg3',count:1};res.items.unshift(f);}
    f.attach=ext.map(type=>({type,shape:CATALOG[type].kind==='tray'?'line':tshape}));if(!f.zone&&ext.length)f.zone=zoneOf(ext[0]);
    f.slots=Object.entries(slotCnt).map(([id,count])=>({id,count}));}
  if(legM)res.items.filter(it=>AI_ROOTS.includes(it.type)).forEach(it=>it.leg=+legM[1]);
  return res;}

/* --- AI 호출 --- */
async function aiAsk(text){
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),25000);
  try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,
      body:JSON.stringify({system:aiSystem(text),prompt:'내 장비: '+text})});
    const d=await r.json().catch(()=>({}));if(!r.ok||!d.text)return {fail:d.error==='limit'?'limit':'error'};
    const o=JSON.parse(d.text.replace(/^```(json)?|```$/g,'').trim());return {ok:o};}
  catch(e){return {fail:'error'};}finally{clearTimeout(to);}}

function aiClean(o){const ids=new Set(aiIds()),exts=new Set(AI_EXTS),out={tent:null,items:[],unknown:[],tip:''};
  if(o&&typeof o.tent==='string'&&TENTS[o.tent]&&o.tent!=='none')out.tent=o.tent;
  const items=[],loose=[],looseS=[];
  (Array.isArray(o&&o.items)?o.items:[]).forEach(it=>{if(!it)return;
    if(exts.has(it.type)){for(let q=0;q<Math.min(4,Math.max(1,+it.count||1));q++)loose.push({type:it.type,shape:'line'});return;}
    if(AI_SLOTS.includes(it.type)||AI_SLOTS.includes(it.id)){looseS.push({id:it.type||it.id,count:Math.min(8,Math.max(1,+it.count||1))});return;}
    if(!ids.has(it.type))return;
    const x={type:it.type,count:Math.min(AI_MAX_EACH,Math.max(1,Math.round(+it.count||1))),zone:AI_ZONES.includes(it.zone)?it.zone:null};
    if(CATALOG[it.type].gtype==='chair'&&typeof it.at==='string'&&(ids.has(it.at)||AI_ROOTS.includes(it.at)))x.at=it.at;
    if(AI_ROOTS.includes(it.type)){x.attach=(Array.isArray(it.attach)?it.attach:[]).filter(a=>a&&exts.has(a.type)).flatMap(a=>Array(Math.min(4,Math.max(1,Math.round(+a.count||1)))).fill({type:a.type,shape:a.shape==='T'?'T':'line'})).slice(0,6);
      if([300,400,660,830].includes(+it.leg))x.leg=+it.leg;
      x.slots=(Array.isArray(it.slots)?it.slots:[]).map(a=>a&&({...a,id:a.id||a.type})).filter(a=>a&&AI_SLOTS.includes(a.id)).slice(0,8).map(a=>({id:a.id,count:Math.min(8,Math.max(1,Math.round(+a.count||1)))}));}
    const same=items.find(y=>y.type===x.type&&!x.attach?.length&&!y.attach?.length&&y.zone===x.zone&&y.at===x.at);
    if(same)same.count=Math.min(AI_MAX_EACH,same.count+x.count);else items.push(x);});
  if(loose.length||looseS.length){let f=items.find(i=>AI_ROOTS.includes(i.type));if(!f){f={type:'reg3',count:1,zone:null,attach:[],slots:[]};items.unshift(f);}
    f.attach=(f.attach||[]).concat(loose).slice(0,6);f.slots=(f.slots||[]).concat(looseS);}
  out.items=items;
  out.unknown=(Array.isArray(o&&o.unknown)?o.unknown:[]).filter(x=>typeof x==='string').slice(0,8).map(x=>x.slice(0,40));
  out.tip=typeof (o&&o.tip)==='string'?o.tip.slice(0,200):'';return out;}

/* --- 조립: IGT + 결합 파츠를 한 덩어리로 --- */
function aiBuild(it){
  const c=CATALOG[it.type],ce=centroid(c.verts),root=newPiece(it.type,{ox:-ce[0],oy:-ce[1],rot:0,z:0});
  if(c.kind!=='gear')root.leg=it.leg||660;
  const set=[root],keep=state.pieces,over=[];state.pieces=set;
  if(root.slots)(it.slots||[]).forEach(sl=>{const t=getItem(sl.id);for(let q=0;q<sl.count;q++){let i=-1;
      for(let k=0;k<root.slots.length;k++)if(freeRun(root.slots,k)>=t.halves){i=k;break;}
      if(i<0){over.push(sl.id);continue;}for(let k=0;k<t.halves;k++)root.slots[i+k]={id:sl.id,head:k===0};}});
  try{const clash=q=>{computeAll();return set.some(o=>o!==q&&o.uid!==q.parent&&satPen(o._v,q._v)>3);};
    (it.attach||[]).forEach(a=>{const ac=CATALOG[a.type],tray=ac.kind==='tray';
      const longs=c.edges.filter(e=>e.long),shorts=c.edges.filter(e=>!e.long);
      // 빈 긴 변을 먼저: 트레이는 다른 결합이 없는 변, 멀티펑션은 아무것도 없는 변
      const busy=e=>{const ks=edgeKids(root,e.name);return tray?-ks.filter(k=>CATALOG[k.type].kind!=='tray').length*10+ks.length:ks.length;};
      const tries=(a.shape==='T'?longs:tray?longs:shorts.concat(longs)).slice().sort((x,y)=>busy(x)-busy(y));
      for(const pe of tries){if(!canTake(root,pe,a.type))continue;
        const ok=ac.edges.filter(ce2=>mateKind(pe.types,ce2.types));if(!ok.length)continue;
        const len=e=>{const v=ac.verts;return dist(v[e.i],v[e.j]);};
        ok.sort((x,y)=>a.shape==='T'?len(x)-len(y):len(y)-len(x));
        let m=ok[0].name;const op=ok.find(e=>e.name===OPP[pe.name]);if(a.shape!=='T'&&op&&Math.abs(len(op)-len(ok[0]))<1)m=op.name;
        const q=newPiece(a.type,{parent:root.uid,pEdge:pe.name,mEdge:m});set.push(q);if(pe.long)distributeLong(root,pe.name);
        if(!clash(q))return;set.pop();if(pe.long)distributeLong(root,pe.name);}
      over.push(a.type);});
    computeAll();
    const coreN=set.length;set.coreN=coreN;set.left=[];
    if(it.seats&&it.seats.length){
      // 앉을 상판: 테이블 자체, IGT면 붙은 멀티펑션·코너·오픈멀티(없으면 IGT 앞, 버너가 있으니 10cm 띄움)
      const ext=set.filter(p=>p!==root&&CATALOG[p.type].kind==='ext'),fr=c.kind==='frame',host=fr&&ext.length?ext:fr?set.filter(p=>p===root||CATALOG[p.type].kind==='tray'):[root];
      const b=bbox(host.flatMap(p=>p._v)),W=b[1][0]-b[0][0],D=b[1][1]-b[0][1],horiz=W>=D,L=horiz?W:D;
      const bar=fr&&!ext.length,IN=bar?-100:60,cwMax=Math.max(...it.seats.map(t=>CATALOG[t].w)),k=bar?Math.min(it.seats.length,3):Math.max(1,Math.floor((L+150)/(cwMax+20)));
      let sides=['+','-'];if(fr&&!ext.length){const ib=bbox(set.flatMap(p=>p._v)),fb=bbox(root._v),plus=horiz?ib[1][1]-fb[1][1]:ib[1][0]-fb[1][0],minus=horiz?fb[0][1]-ib[0][1]:fb[0][0]-ib[0][0];sides=[plus>=minus?'+':'-'];}
      const spots=[];for(let i=0;i<k;i++)sides.forEach(sd=>spots.push({sd,i}));if(!(fr&&!ext.length))spots.push({sd:'e+'},{sd:'e-'});
      const mid=[(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2],lo=horiz?b[0][0]:b[0][1],others=set.filter(p=>!host.includes(p)),taken=[];
      let si=0;it.seats.forEach(t=>{const ch=CATALOG[t],cd=ch.d,cc=centroid(ch.verts);let ok=null;
        while(!ok&&si<spots.length){const sp=spots[si++];let pos,n;
          if(sp.sd==='+'||sp.sd==='-'){const a=bar?(horiz?mid[0]:mid[1])+(sp.i-(k-1)/2)*(cwMax+60):lo+L*(sp.i+.5)/k,pp=sp.sd==='+'?(horiz?b[1][1]:b[1][0])+cd/2-IN:(horiz?b[0][1]:b[0][0])-cd/2+IN;
            pos=horiz?[a,pp]:[pp,a];n=sp.sd==='+'?(horiz?[0,1]:[1,0]):(horiz?[0,-1]:[-1,0]);}
          else{const e=sp.sd==='e+'?(horiz?b[1][0]:b[1][1])+cd/2-IN:(horiz?b[0][0]:b[0][1])-cd/2+IN;pos=horiz?[e,mid[1]]:[mid[0],e];n=sp.sd==='e+'?(horiz?[1,0]:[0,1]):(horiz?[-1,0]:[0,-1]);}
          const ex=n[0]?cd:ch.w,ey=n[0]?ch.w:cd,box=[[pos[0]-ex/2,pos[1]-ey/2],[pos[0]+ex/2,pos[1]-ey/2],[pos[0]+ex/2,pos[1]+ey/2],[pos[0]-ex/2,pos[1]+ey/2]];
          if(others.some(o=>satPen(box,o._v)>3)||taken.some(q=>satPen(box,q)>3))continue;
          taken.push(box);ok={pos,rot:n[1]===1?180:n[1]===-1?0:n[0]===1?90:270};}
        if(!ok){set.left.push(t);return;}
        set.push(newPiece(t,{ox:ok.pos[0]-cc[0],oy:ok.pos[1]-cc[1],rot:ok.rot,z:0}));});
      computeAll();}}
  finally{state.pieces=keep;}
  return {pieces:set,polys:set.map(p=>p._v.map(v=>v.slice())),heat:!!c.heat,over,coreN:set.coreN,left:set.left,seated:set.length>set.coreN};}

/* --- 자리 잡기 --- */
function aiRotPolys(polys,rot,P){const th=rot*Math.PI/180,co=Math.cos(th),si=Math.sin(th);
  return polys.map(pl=>pl.map(v=>[P[0]+co*v[0]-si*v[1],P[1]+si*v[0]+co*v[1]]));}
function aiEdgeDist(p,poly){let m=Infinity;for(let k=0;k<poly.length;k++)m=Math.min(m,segDist(p,poly[k],poly[(k+1)%poly.length]));return m;}
function aiRegion(){const T=TENTS[tent.id];const a=allowedPolys(T);if(a.length)return {polys:a,wall:T.outer,center:T.living};
  if(TW)return {polys:[TW.fabric],wall:TW.fabric,center:centroid(TW.fabric)};
  const r=[[-2000,-1500],[2000,-1500],[2000,1500],[-2000,1500]];return {polys:[r],wall:r,center:[0,0]};}

function aiPlace(list){
  const R=aiRegion(),inner=tentInner(),ip=inner?inner.poly:null,doors=doorZones().map(z=>z.poly);
  const bb=bbox(R.polys.flat()),placed=[],out=[],miss=[];
  const rank={inner:0,wall:1,left:2,right:2,top:2,bottom:2,center:3};
  const area=x=>x.polys.reduce((s,pl)=>s+polyArea(pl),0);
  const queue=list.slice().sort((a,b)=>rank[a.zone]-rank[b.zone]||area(b)-area(a));
  const STEP=100,WALK=450;
  // 동선: 이너룸이 있으면 가장 먼 출입구에서 이너룸까지 폭 70cm 길은 비워둠
  let lane=null;if(ip&&doors.length){const ic=centroid(ip),far=doors.map(d=>centroid(d)).sort((a,b)=>dist(b,ic)-dist(a,ic))[0];
    let best2=null;for(let k=0;k<ip.length;k++){const A=ip[k],B=ip[(k+1)%ip.length];for(let t=0;t<=1;t+=.1){const q=[A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t];if(!best2||dist(q,far)<dist(best2,far))best2=q;}}
    const u=[best2[0]-far[0],best2[1]-far[1]],l=Math.hypot(...u)||1,nn=[-u[1]/l*350,u[0]/l*350];
    lane=[[far[0]+nn[0],far[1]+nn[1]],[best2[0]+nn[0],best2[1]+nn[1]],[best2[0]-nn[0],best2[1]-nn[1]],[far[0]-nn[0],far[1]-nn[1]]];}
  aiPlace.lane=lane;
  const kitchen=()=>placed.filter(q=>q.frame);
  for(const it of queue){const heat=it.heat,gapW=heat?600:40,core=it.coreN||it.polys.length;let best=null;
    for(const strict of [true,false]){if(best)break;
    for(const rot of [0,90,180,270])for(let x=bb[0][0];x<=bb[1][0];x+=STEP)for(let y=bb[0][1];y<=bb[1][1];y+=STEP){
      const PS=aiRotPolys(it.polys,rot,[x,y]),V=PS.flat(),CV=PS.slice(0,core).flat();
      if(!V.every(v=>R.polys.some(pl=>pointInPoly(v,pl))))continue;
      if(it.zone==='inner'&&ip){if(!V.every(v=>pointInPoly(v,ip)))continue;}
      else if(ip&&PS.some(pl=>satPen(pl,ip)>3||pl.some(v=>pointInPoly(v,ip))))continue;
      if(PS.some(pl=>doors.some(d=>satPen(pl,d)>3)))continue;
      if(PS.some(pl=>polyGap(pl,R.wall)<gapW))continue;
      if(strict&&lane&&it.zone!=='inner'&&PS.some(pl=>satPen(pl,lane)>3))continue;
      const need=q=>Math.max(heat||q.heat?(strict?700:300):0,strict&&!(it.zone==='wall'&&q.zone==='wall')?WALK:60);
      if(placed.some(q=>{const g=need(q);return PS.some(pl=>q.polys.some(qp=>satPen(pl,qp)>3||polyGap(pl,qp)<g));}))continue;
      const b=bbox(V),ce=[(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2];let s;
      if(it.zone==='wall')s=CV.reduce((a,v)=>a+aiEdgeDist(v,R.wall),0)/CV.length;
      else if(it.zone==='inner'&&ip)s=V.reduce((a,v)=>a+aiEdgeDist(v,ip),0)/V.length;
      else if(it.zone==='right')s=(bb[1][0]-b[1][0])*3+Math.abs(ce[1]-R.center[1]);
      else if(it.zone==='left')s=(b[0][0]-bb[0][0])*3+Math.abs(ce[1]-R.center[1]);
      else if(it.zone==='top')s=(b[0][1]-bb[0][1])*3+Math.abs(ce[0]-R.center[0]);
      else if(it.zone==='bottom')s=(bb[1][1]-b[1][1])*3+Math.abs(ce[0]-R.center[0]);
      else{s=dist(ce,R.center)+(heat&&placed.length?-Math.min(...placed.map(q=>dist(ce,centroid(q.polys.flat()))),1500)*.3:0);
        // 식탁 세트는 주방(IGT) 가까이: 사이 통로 약 80cm
        if(it.seated&&kitchen().length){const g=Math.min(...kitchen().map(q=>Math.min(...PS.map(pl=>Math.min(...q.polys.map(qp=>polyGap(pl,qp)))))));s=s*.4+Math.abs(g-800)*1.2;}}
      s+=rot%180?1:0; // 같은 점수면 돌리지 않은 쪽
      if(!best||s<best.s)best={s,rot,P:[x,y],PS};}}
    if(best){placed.push({polys:best.PS,heat,zone:it.zone,frame:CATALOG[it.type].kind==='frame'});out.push({it,rot:best.rot,P:best.P});}else miss.push(it);}
  let mx=bb[1][0]+700,my=bb[0][1];
  miss.forEach(it=>{const b=bbox(it.polys.flat()),w=b[1][0]-b[0][0],h=b[1][1]-b[0][1];out.push({it,rot:0,P:[mx-b[0][0],my-b[0][1]]});my+=h+150;});
  return {out,miss:miss.map(m=>m.type)};}

function aiApply(res){
  if(res.tent&&res.tent!==tent.id){const T=TENTS[res.tent];tent={id:res.tent,inner:T.innerDefault,canopy:false,custom:tent.custom};
    if(tarp.id)placeTarpDefault();renderTentList();renderTentOpts();}
  TW=tarpWorld();
  // 의자는 테이블(없으면 IGT 앞)에 둘러앉히고, 남는 의자만 따로 둠
  const units=[];res.items.forEach(it=>{for(let k=0;k<it.count&&units.length<AI_MAX_TOTAL;k++)units.push({...it,count:1,seats:[]});});
  const isChair=u=>CATALOG[u.type].gtype==='chair'&&(!u.zone||u.zone==='center'||u.zone==='top'||u.zone==='bottom');
  const isTable=u=>{const c=CATALOG[u.type];return c.kind==='gear'&&c.gtype==='table'&&!['sp_kitchen','mytable','mytable_s'].includes(u.type)&&Math.max(c.w,c.d)>=500;};
  const chairs=units.filter(isChair),hosts=units.filter(isTable).sort((a,b)=>CATALOG[b.type].w*CATALOG[b.type].d-CATALOG[a.type].w*CATALOG[a.type].d);
  const roots=units.filter(u=>AI_ROOTS.includes(u.type));
  roots.filter(u=>(u.attach||[]).some(a=>CATALOG[a.type].kind!=='tray')).forEach(u=>hosts.push(u));
  if(!hosts.length&&roots.length)hosts.push(roots[0]);
  // "IGT 앞에" 처럼 자리를 지정한 의자 먼저
  chairs.filter(u=>u.at).forEach(u=>{const h=units.find(v=>v.type===u.at&&v!==u);if(h){h.seats.push(u.type);units.splice(units.indexOf(u),1);chairs.splice(chairs.indexOf(u),1);}});
  if(hosts.length&&chairs.length){const cap=h=>{const c=CATALOG[h.type];if(c.kind!=='gear')return 4;const cw=Math.max(...chairs.map(u=>CATALOG[u.type].w));return 2*Math.max(1,Math.floor((Math.max(c.w,c.d)+150)/(cw+20)))+2;};
    let hi=0;chairs.forEach(u=>{while(hi<hosts.length-1&&hosts[hi].seats.length>=cap(hosts[hi]))hi++;hosts[hi].seats.push(u.type);});chairs.forEach(u=>units.splice(units.indexOf(u),1));
    hosts.forEach(h=>{if(!h.zone&&!AI_ROOTS.includes(h.type))h.zone='center';});}
  const list=[];units.forEach(it=>{const b=aiBuild(it);list.push({type:it.type,zone:it.zone||aiZone(it.type),...b});
    (b.left||[]).forEach(t=>{const lb=aiBuild({type:t});list.push({type:t,zone:'center',...lb});});});
  const {out,miss}=aiPlace(list);aiApply.over=list.flatMap(x=>x.over||[]);
  state.pieces=[];sel=null;
  out.forEach(({it,rot,P})=>{const root=it.pieces[0],c=centroid(CATALOG[root.type].verts),map={};
    it.pieces.forEach(p=>{const q=newPiece(p.type,{parent:p.parent==null?null:map[p.parent],pEdge:p.pEdge,mEdge:p.mEdge,slide:p.slide});
      if(p.parent==null&&p===root){q.ox=P[0]-c[0];q.oy=P[1]-c[1];q.rot=rot;q.z=++Z_TOP;if(p.leg)q.leg=p.leg;}
      else if(p.parent==null){const cp=centroid(CATALOG[p.type].verts),lx=p.ox+cp[0],ly=p.oy+cp[1],th=rot*Math.PI/180,co=Math.cos(th),si=Math.sin(th);
        q.ox=P[0]+co*lx-si*ly-cp[0];q.oy=P[1]+si*lx+co*ly-cp[1];q.rot=((p.rot||0)+rot)%360;q.z=++Z_TOP;}
      if(p.slots)q.slots=p.slots.map(x=>x&&{...x});
      map[p.uid]=q.uid;state.pieces.push(q);});});
  fitView();render();return miss;}

/* --- 화면 --- */
async function aiRun(){
  const inp=document.getElementById('aiIn'),btn=document.getElementById('aiGo'),st=document.getElementById('aiSt'),box=document.getElementById('aiOut');
  const text=(inp.value||'').trim().slice(0,600);
  if(text.length<2){st.textContent='가진 장비를 먼저 적어주세요';inp.focus();return;}
  if(state.pieces.length&&!confirm('지금 놓인 장비를 지우고 AI 세팅으로 바꿀까요? 되돌리기(↶)로 돌아갈 수 있어요.'))return;
  btn.disabled=true;st.textContent='AI가 장비를 찾는 중…';box.hidden=true;
  let r=await aiAsk(text),res,via='ai';
  if(r.ok){res=aiClean(r.ok);
    // AI가 모른다고 한 이름도 별칭으로 한 번 더 찾아보기
    res.unknown=res.unknown.filter(u=>{const l=aiLocal(u);if(!l.items.length)return true;
      l.items.forEach(x=>{if(x.slots&&x.slots.length||x.attach&&x.attach.length){let f=res.items.find(i=>AI_ROOTS.includes(i.type));if(f){f.slots=(f.slots||[]).concat(x.slots||[]);f.attach=(f.attach||[]).concat(x.attach||[]);return;}}
        if(x.type==='reg3'&&(x.slots||x.attach))return;const same=res.items.find(i=>i.type===x.type);if(same)return;res.items.push({type:x.type,count:x.count,zone:null});});return false;});if(!res.items.length&&!res.tent){const l=aiLocal(text);if(l.items.length){res=l;via='local';}}}
  else{res=aiLocal(text);via=r.fail==='limit'?'limit':'local';}
  btn.disabled=false;
  if(!res.items.length&&!res.tent){st.textContent='';box.hidden=false;
    box.innerHTML=`<p class="ai-warn">목록에서 맞는 장비를 못 찾았어요. ‘장비 제원’ 탭의 이름으로 적어보세요 (예: 폴딩쉘프, IGT 롱, 체어원).</p>`;return;}
  const miss=aiApply(res);
  st.textContent=via==='ai'?'세팅했어요. 끌어서 다듬어 보세요':'기본 자동 배치로 세팅했어요';
  const nm=id=>aiEsc(CATALOG[id].name),ZN={center:'가운데',wall:'벽쪽',inner:'이너룸',left:'왼쪽',right:'오른쪽',top:'위쪽',bottom:'아래쪽'};
  let h='';
  if(via!=='ai')h+=`<p class="ai-note">${via==='limit'?'오늘 AI 사용량이 많아서':'AI 연결이 안 돼서'} 이름이 같은 장비만 찾아 놓았어요.</p>`;
  h+=`<ul class="ai-got">${res.tent?`<li class="ai-tent">⛺ ${aiEsc(aiTentName(res.tent))}</li>`:''}${res.items.map(it=>`<li>${nm(it.type)}${it.attach&&it.attach.length?' + '+Object.entries(it.attach.reduce((m,a)=>{const k=nm(a.type)+(a.shape==='T'?' (T자)':'');m[k]=(m[k]||0)+1;return m;},{})).map(([k,n])=>k+(n>1?' ×'+n:'')).join(' + '):''}${it.count>1?` <b>×${it.count}</b>`:''}${it.slots&&it.slots.length?' · 칸: '+it.slots.map(sl=>aiEsc(aiSlotName(sl.id))+(sl.count>1?' ×'+sl.count:'')).join(', '):''}${it.leg?` · ${it.leg}다리`:''}${it.zone&&it.zone!==aiZone(it.type)?` · ${ZN[it.zone]}`:''}</li>`).join('')}</ul>`;
  if(aiApply.over&&aiApply.over.length)h+=`<p class="ai-warn">자리가 모자라 IGT에 못 붙인 파츠: ${[...new Set(aiApply.over)].map(id=>aiEsc(CATALOG[id]?CATALOG[id].name:aiSlotName(id))).join(', ')}</p>`;
  if(miss.length)h+=`<p class="ai-warn">자리가 모자라 텐트 밖 오른쪽에 둔 장비: ${[...new Set(miss)].map(nm).join(', ')}</p>`;
  if(res.unknown.length)h+=`<p class="ai-warn">목록에 아직 없어서 빼둔 장비: ${res.unknown.map(aiEsc).join(', ')}</p>`;
  if(res.tip)h+=`<p class="ai-tip">💡 ${aiEsc(res.tip)}</p>`;
  box.innerHTML=h;box.hidden=false;
  const b=document.getElementById('board');if(b&&b.scrollIntoView&&innerWidth<900)setTimeout(()=>b.scrollIntoView({behavior:'smooth',block:'start'}),400);}
