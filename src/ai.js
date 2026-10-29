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
const AI_ALIAS={reg3:['IGT 3유닛','IGT 프레임 3유닛','아이지티 3유닛','IGT 레귤러','아이지티 레귤러','IGT 프레임 레귤러'],long4:['IGT 롱','IGT 4유닛','IGT 프레임 롱'],
  sep2:['세퍼레이트 2유닛','세퍼레이트 하프'],sep3:['세퍼레이트 3유닛','세퍼레이트 레귤러','세퍼레이트 IGT'],sep4:['세퍼레이트 4유닛','세퍼레이트 롱'],
  mf_reg:['멀티펑션','멀티펑션 테이블'],slide_h:['하프슬라이드','슬라이드하프','슬라이드 트레이'],slide_hl:['하프슬라이드 롱','슬라이드하프롱'],
  mytable_s:['스텐 마이테이블','스탠 마이테이블','스텐마이테이블','스탠마이테이블','스테인리스 마이테이블'],
  flat:['플랫버너'],sp_jikaro:['지카로','지카로테이블','지카로 테이블','ST-050'],sp_gs1000:['강염버너','강염스토브','GS-1000','스노우피크 강염'],seppou:['설봉','그릴버너'],steel1:['원유닛 트레이','1유닛 트레이','스텐트레이','스텐 트레이','스탠트레이'],lid_half:['리드트레이'],box_half:['스텐박스'],
  wood_s:['우드테이블 S','우드 S'],wood_w:['우드테이블 W','우드 W'],mesh_d1:['메쉬트레이 딥'],mesh_s1:['메쉬트레이'],mf_long:['멀티펑션 롱','멀티펑션롱'],open_L:['오픈멀티펑션 L'],open_R:['오픈멀티펑션 R'],corner_L:['코너테이블 L'],corner_R:['코너테이블 R'],
  sp_fd:['FD체어','에프디체어'],hx_one:['체어원','헬리녹스 체어원','헬리녹스체어원'],hx_zero:['체어제로','헬리녹스 체어제로'],omni230:['옴니','옴니230'],camp5000:['파세코 팬히터','캠프5000','파세코'],mk_stove:['MK스토브','화목난로','장작난로'],toyotomi_lcl53:['토요토미 팬히터','LC-L53'],sfh_bh900:['신일 900','신일 팬히터 900'],sfh1200:['신일 1200','신일 팬히터 1200'],cfx3_35:['도메틱 35','CFX3 35'],cfx3_45:['도메틱 45','CFX3 45'],cfx3_55:['도메틱 55','CFX3 55'],
  megamat_duo:['메가매트 듀오','메가메트 듀오'],megamat:['메가매트','메가메트'],zebec_pro240:['에어리스 프로 240','제백 프로 240'],zebec_pro260:['에어리스 프로 260','제백 프로 260','제백 에어매트','에어리스 프로','제백 프로'],zebec_pro280:['에어리스 프로 280','제백 프로 280'],zebec_pro300:['에어리스 프로 300','제백 프로 300'],cot_one:['코트원'],sp_oat_low:['원액션 로우'],sp_oat:['원액션테이블'],
  merak_pro:['메락'],landlock:['랜드락'],living_shell_long_pro:['리빙쉘 롱 프로','리빙쉘롱'],living_shell:['리빙쉘']};
const AI_INNER_AL={shell_duo:['쉘이너','쉘이너 듀오','쉘 이너'],geoair2:['지오에어','지오 에어','지오에어2','지오 에어2'],godong:['고동','고동텐트','고동 텐트','고동 이너','고동이너텐트']};
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
// 홍중 말투 대본(긴 구어체·오타·높이·이너·고치기) 50개 중 일부. 전체 100개는 scripts/ai-scripts100.json
const AI_EXAMPLES2=[["메락에 고동 이너텐트 쓰고 제백 에어매트 깔거야. 세퍼레이트 레귤러에 멀티펑션 롱 T자로 붙이고 하프슬라이드 2개, 다리는 660으로 해줘 플랫버너랑 원유닛 트레이 2개 넣고 FD체어 2개",{"tent":"merak_pro","items":[{"type":"zebec_pro260","zone":"inner"},{"type":"sep3","zone":"wall","attach":[{"type":"mf_long","shape":"T"},{"type":"slide_h","shape":"line"},{"type":"slide_h","shape":"line"}],"slots":[{"id":"flat","count":1},{"id":"steel1","count":2}],"leg":660},{"type":"sp_fd","count":2,"zone":"center","at":"sep3"}],"unknown":[],"tip":"고동 안에 제백 매트, 주방 IGT는 벽쪽에 두고 멀티펑션 양옆에 FD체어를 앉혔어요.","inner":"godong"}],["쉘터gm에 세퍼레이트 레귤러 두고 멀티펑션 롱 일자로 붙여줘 노가체어 2개 앉고 파세코 5000은 벽쪽 도메틱 45도 벽쪽에 둘게",{"tent":"mw_shelter_gm","items":[{"type":"sep3","zone":"wall","attach":[{"type":"mf_long","shape":"line"}]},{"type":"noga_chair","count":2,"zone":"center","at":"sep3"},{"type":"camp5000","zone":"wall"},{"type":"cfx3_45","zone":"wall"}],"unknown":[],"tip":""}],["랜드록 쓸건데 igt 롱 벽쪽에 놓고 코너테이블 양쪽 다 붙여줘 칸은 설봉원 플랫버너 우드테이블 w 들어가고 가운데 원액션 롱 놓고 테이크체어 4개",{"tent":"landlock","items":[{"type":"long4","zone":"wall","attach":[{"type":"corner_L","shape":"line"},{"type":"corner_R","shape":"line"}],"slots":[{"id":"seppou","count":1},{"id":"flat","count":1},{"id":"wood_w","count":1}]},{"type":"sp_oat_l","zone":"center"},{"type":"sp_take","count":4,"zone":"center"}],"unknown":[],"tip":""}],["리빙쉘롱프로에 쉘이너 듀오 넣고 메가매트 듀오 깔아줘 거실엔 로우테이블이랑 로우체어 30 두개",{"tent":"living_shell_long_pro","items":[{"type":"megamat_duo","zone":"inner"},{"type":"sp_oat_low","zone":"center"},{"type":"sp_low30","count":2,"zone":"center"}],"unknown":[],"tip":"","inner":"shell_duo"}],["오늘은 쉘터gm 쓰고 이너는 지오에어2 넣을게 메가매트 하나만 깔고 igt는 세퍼레이트 2유닛에 플랫버너 하나 노가테이블 노가체어2",{"tent":"mw_shelter_gm","items":[{"type":"megamat","zone":"inner"},{"type":"sep2","zone":"wall","slots":[{"id":"flat","count":1}]},{"type":"noga_table","zone":"center"},{"type":"noga_chair","count":2,"zone":"center"}],"unknown":[],"tip":"","inner":"geoair2"}],["메락 프로에 세퍼레이트 레귤러 860높이로 하고 플랫버너 설봉원 넣어줘 멀티펑션 롱은 앞에 t자 FD체어 3개",{"tent":"merak_pro","items":[{"type":"sep3","zone":"wall","attach":[{"type":"mf_long","shape":"T"}],"slots":[{"id":"flat","count":1},{"id":"seppou","count":1}],"leg":830},{"type":"sp_fd","count":3,"zone":"center","at":"sep3"}],"unknown":[],"tip":""}],["주방은 텐트 입구쪽에 두고 식탁은 안쪽으로 해줘 쉘터gm, 세퍼레이트 레귤러 설봉원, 원액션테이블 롱 FD체어 4개",{"tent":"mw_shelter_gm","items":[{"type":"sep3","zone":"bottom","slots":[{"id":"seppou","count":1}]},{"type":"sp_oat_l","zone":"top"},{"type":"sp_fd","count":4,"zone":"top"}],"unknown":[],"tip":"요리는 입구 쪽, 식탁은 안쪽이라 연기가 밖으로 빠져요."}],["메락에 고동 이너, 제백 프로 280 깔고 세퍼레이트 4유닛 하프슬라이드 롱 하나 붙여 플랫버너 메쉬트레이 2개 넣고 커밋체어 2개 커밋테이블",{"tent":"merak_pro","items":[{"type":"zebec_pro280","zone":"inner"},{"type":"sep4","zone":"wall","attach":[{"type":"slide_hl","shape":"line"}],"slots":[{"id":"flat","count":1},{"id":"mesh_s1","count":2}]},{"type":"kermit_t","zone":"center"},{"type":"kermit","count":2,"zone":"center"}],"unknown":[],"tip":"","inner":"godong"}],["겨울이라 파세코 5000이랑 신일 900 두대 쓸거야 텐트는 리빙쉘 원액션테이블 하이에 FD체어 2개",{"tent":"living_shell","items":[{"type":"camp5000","zone":"wall"},{"type":"sfh_bh900","zone":"wall"},{"type":"sp_oat","zone":"center"},{"type":"sp_fd","count":2,"zone":"center"}],"unknown":[],"tip":""}],["비바돔플러스에 마운틴리버 야전침대 2개 놓고 노가체어 2개 스텐마이테이블",{"tent":null,"items":[{"type":"noga_chair","count":2,"zone":"center"},{"type":"mytable_s","zone":"center"}],"unknown":["비바돔플러스","마운틴리버 야전침대"],"tip":"비바돔 플러스와 마운틴리버 야전침대는 아직 제원에 없어서 뺐어요."}],["igt 레귤러 다리 830 서서 요리할거고 플랫버너 두개 넣어 원유닛트레이 하나 멀티펑션 일자로 붙여",{"tent":null,"items":[{"type":"reg3","zone":"wall","attach":[{"type":"mf_reg","shape":"line"}],"slots":[{"id":"flat","count":2},{"id":"steel1","count":1}],"leg":830}],"unknown":[],"tip":""}],["노스피크 a9에 세퍼레이트 레귤러 + 멀티펑션 롱 T자 + 하프슬라이드 2개, 칸은 설봉원 플랫버너 원유닛 트레이 하나 다리 660 체어는 테이크체어 4개 원액션 롱 하나",{"tent":"np_a9","items":[{"type":"sep3","zone":"wall","attach":[{"type":"mf_long","shape":"T"},{"type":"slide_h","shape":"line"},{"type":"slide_h","shape":"line"}],"slots":[{"id":"seppou","count":1},{"id":"flat","count":1},{"id":"steel1","count":1}],"leg":660},{"type":"sp_oat_l","zone":"center"},{"type":"sp_take","count":4,"zone":"center"}],"unknown":[],"tip":""}],["메락에 오른쪽엔 침실 고동 이너 메가매트 듀오 왼쪽은 주방 세퍼레이트 레귤러 플랫버너 하프슬라이드 2개 가운데 원액션 로우 로우체어30 두개",{"tent":"merak_pro","items":[{"type":"megamat_duo","zone":"inner"},{"type":"sep3","zone":"left","attach":[{"type":"slide_h","shape":"line"},{"type":"slide_h","shape":"line"}],"slots":[{"id":"flat","count":1}]},{"type":"sp_oat_low","zone":"center"},{"type":"sp_low30","count":2,"zone":"center","at":"sp_oat_low"}],"unknown":[],"tip":"","inner":"godong"}],["도메틱 55 냉장고 오른쪽 끝에 두고 igt 롱은 왼쪽 벽 쉘터gm",{"tent":"mw_shelter_gm","items":[{"type":"cfx3_55","zone":"right"},{"type":"long4","zone":"left"}],"unknown":[],"tip":""}],["쉘터gm 에 큐브 쉘프 2개랑 사이드 테이블 노가체어 2",{"tent":"mw_shelter_gm","items":[{"type":"noga_chair","count":2,"zone":"center"}],"unknown":["큐브 쉘프","사이드 테이블"],"tip":"큐브 쉘프·사이드 테이블은 어떤 제품인지 목록에서 못 찾았어요."}],["파세코 팬히터 식탁 쪽 보게 해줘 쉘터gm 원액션테이블 fd체어2",{"tent":"mw_shelter_gm","items":[{"type":"camp5000","zone":"wall"},{"type":"sp_oat","zone":"center"},{"type":"sp_fd","count":2,"zone":"center"}],"unknown":[],"tip":"팬히터 바람이 식탁 쪽으로 가게 돌렸어요."}],["세퍼레이트 2유닛 두개 놓을게 하나는 플랫버너 하나는 원유닛트레이 체어는 헬리녹스 체어제로 2개",{"tent":null,"items":[{"type":"sep2","zone":"wall","slots":[{"id":"flat","count":1}]},{"type":"sep2","zone":"wall","slots":[{"id":"steel1","count":1}]},{"type":"hx_zero","count":2,"zone":"center"}],"unknown":[],"tip":""}],["그냥 의자 4개랑 테이블 하나",{"tent":null,"items":[],"unknown":["의자 4개","테이블"],"tip":"어떤 제품인지 이름을 알려주시면 정확히 놓을게요."}],["쉘터gm 앞쪽 입구엔 아무것도 두지 말고 뒤쪽에 세퍼레이트 레귤러 플랫버너 노가체어 2",{"tent":"mw_shelter_gm","items":[{"type":"sep3","zone":"top","slots":[{"id":"flat","count":1}]},{"type":"noga_chair","count":2,"zone":"center","at":"sep3"}],"unknown":[],"tip":"입구 쪽은 비웠어요."}]];
const AI_FIX_PREV={"tent":"merak_pro","inner":"godong","items":[{"type":"megamat","zone":"inner"},{"type":"sep3","zone":"center","attach":[{"type":"mf_long","shape":"line"},{"type":"slide_h","shape":"line"},{"type":"slide_h","shape":"line"}],"slots":[{"id":"seppou","count":1},{"id":"flat","count":1}],"leg":830},{"type":"camp5000","zone":"wall"},{"type":"sp_fd","count":2,"zone":"center","at":"sep3"}],"unknown":[]};
const AI_FIX_EXAMPLES=[["테이블을 T자모양으로 수정해줘",{"tent":"merak_pro","items":[{"type":"megamat","zone":"inner"},{"type":"sep3","zone":"center","attach":[{"type":"mf_long","shape":"T"},{"type":"slide_h","shape":"line"},{"type":"slide_h","shape":"line"}],"slots":[{"id":"seppou","count":1},{"id":"flat","count":1}],"leg":830},{"type":"camp5000","zone":"wall"},{"type":"sp_fd","count":2,"zone":"center","at":"sep3"}],"unknown":[],"tip":"멀티펑션 롱을 T자로 붙였어요.","inner":"godong"}],["팬히터는 좌측 벽에서 식탁쪽 방향을 바라보자",{"tent":"merak_pro","items":[{"type":"megamat","zone":"inner"},{"type":"sep3","zone":"center","attach":[{"type":"mf_long","shape":"line"},{"type":"slide_h","shape":"line"},{"type":"slide_h","shape":"line"}],"slots":[{"id":"seppou","count":1},{"id":"flat","count":1}],"leg":830},{"type":"camp5000","zone":"left"},{"type":"sp_fd","count":2,"zone":"center","at":"sep3"}],"unknown":[],"tip":"팬히터를 왼쪽 벽으로 옮기고 식탁 쪽을 보게 했어요.","inner":"godong"}],["fd체어 하나 더 추가해줘",{"tent":"merak_pro","items":[{"type":"megamat","zone":"inner"},{"type":"sep3","zone":"center","attach":[{"type":"mf_long","shape":"line"},{"type":"slide_h","shape":"line"},{"type":"slide_h","shape":"line"}],"slots":[{"id":"seppou","count":1},{"id":"flat","count":1}],"leg":830},{"type":"camp5000","zone":"wall"},{"type":"sp_fd","count":3,"zone":"center","at":"sep3"}],"unknown":[],"tip":"FD체어를 3개로 늘렸어요.","inner":"godong"}],["이너를 쉘이너 듀오로 바꿔",{"tent":"merak_pro","items":[{"type":"megamat","zone":"inner"},{"type":"sep3","zone":"center","attach":[{"type":"mf_long","shape":"line"},{"type":"slide_h","shape":"line"},{"type":"slide_h","shape":"line"}],"slots":[{"id":"seppou","count":1},{"id":"flat","count":1}],"leg":830},{"type":"camp5000","zone":"wall"},{"type":"sp_fd","count":2,"zone":"center","at":"sep3"}],"unknown":[],"tip":"이너를 쉘이너 듀오로 바꿨어요.","inner":"shell_duo"}]];
function aiSystem(text='',fix=false){
  const tents=aiTentCands(text).map(id=>`${id}|${aiTentName(id)}${aiAl(id)}`).join('\n')||'(글에서 찾은 텐트 없음)';
  const gear=aiIds().map(id=>`${id}|${CATALOG[id].name}${aiAl(id)}`).join('\n');
  const ext=AI_EXTS.map(id=>`${id}|${CATALOG[id].name}${aiAl(id)}`).join('\n');
  const slots=SLOT_ITEMS.map(t=>`${t.id}|${t.name}|${t.halves/2}유닛${aiAl(t.id)}`).join('\n');
  const head=`너는 캠핑 텐트 안 배치 도우미야. 사용자 글에서 장비와 원하는 위치를 읽고 아래 목록의 id로만 바꿔.
JSON만 출력: {"tent":"텐트 id 또는 null","inner":"[이너텐트] id 또는 null","items":[{"type":"장비 id","count":1,"zone":"wall|center|inner|left|right|top|bottom","attach":[{"type":"결합 id","shape":"T|line"}],"slots":[{"id":"칸 파츠 id","count":1}],"leg":660,"at":"(체어만) 앉을 테이블·IGT id"}],"unknown":["목록에 없는 장비"],"tip":"배치 팁 한두 문장(한국어, 존댓말)"}
규칙:
- 사용자 글에 없는 장비는 절대 추가하지 마. 띄어쓰기·오타가 있어도 (=별칭)을 보고 맞춰 (예: 스탠마이테이블=mytable_s).
- '테이블','의자','버너'처럼 브랜드·모델 없는 일반 이름은 아무 제품으로 바꾸지 말고 unknown에.
- 수량이 없으면 1. 같은 id는 count로 합쳐. 목록에 없으면 unknown에 원래 이름 그대로.
- 목록에 없는 브랜드·모델은 비슷한 장비로 바꾸지 마. 예: '마운틴리버 야전침대'가 목록에 없으면 코트원으로 바꾸지 말고 unknown에만.
- zone: 사용자가 말한 위치를 따름. 가운데/중앙=center, 벽쪽=wall, 오른쪽(끝)=right, 왼쪽=left, 위쪽/뒤쪽=top, 아래쪽/앞쪽=bottom, 이너룸/침실=inner. 말이 없으면 매트·코트=inner, IGT·선반·박스=wall, 체어·테이블·난로=center.
- [결합] 목록의 멀티펑션·코너·오픈멀티펑션은 혼자 두지 말고 IGT 프레임 항목의 attach에 넣어. IGT 앞(긴 변)에 붙여 앞으로 내면 shape "T"(T자/앞에 붙여), 일자로 길게 이으면(IGT 끝에 연결) "line". 말이 없으면 "line". IGT를 말하지 않았으면 reg3을 하나 만들어 붙여.
- [IGT 칸] 목록(버너·트레이·상판·수납)은 장비가 아니라 IGT 프레임 칸에 끼우는 파츠라 IGT 항목의 slots에 넣어. 슬라이드 트레이는 attach(shape line).
- leg: IGT 다리 높이(300/400/660/830)를 말하면 IGT 항목에 넣어. 목록에 없는 숫자(예: 860)는 그대로 적어도 돼(가까운 다리로 맞춤). 멀티펑션 높이는 IGT 다리를 따라가니 따로 넣지 마. 없으면 생략.
- 같은 결합 파츠가 여러 개면(예: 하프슬라이드 2개) attach에 개수만큼 넣어.
- 의자는 따로 흩어 두지 않아. 코드가 테이블(없으면 IGT 앞) 둘레에 앉혀 주니까 체어는 zone을 비우거나 center로.
- 동선: 요리(IGT)는 벽쪽, 식탁 세트는 그 앞, 출입구에서 이너룸까지 길은 비워. tip에 이런 동선 팁을 짧게.
- 강염버너(sp_gs1000)는 바닥에 세우는 장비라 IGT 칸이 아니야. 칸 파츠 id는 [IGT 칸] 목록 id만(flat, seppou, steel1…).
- [이너텐트] 목록(쉘이너·지오에어·고동)은 글에 그 이름이 있을 때만 inner에. 그 외에는 null.
- [이너텐트] 목록(쉘이너·지오에어·고동)은 장비가 아니라 텐트 안에 넣는 이너라서 inner에 id를 넣어. unknown에 넣지 마.
- [고치기] '지금 배치(JSON)'와 '고칠 점'이 오면 고칠 점만 반영하고 나머지는 그대로 둔 전체 JSON을 다시 출력해. tip에는 무엇을 바꿨는지 한 문장.
- 텐트를 말하지 않으면 null. [텐트] 후보에 없는 텐트면 비슷한 모델로 바꾸지 말고 null + unknown에 이름.
[텐트 후보]
${tents}
[이너텐트]
${Object.entries(INNER_PRESETS).map(([k,P])=>`${k}|${P.name} ${P.w}×${P.d}cm (=${AI_INNER_AL[k].join(', ')})`).join('\n')}
[장비]
${gear}
[결합]
${ext}
[IGT 칸]
${slots}
[예시] 입력 → 출력 (count 없으면 1)
`;
  const W=aiWords(text),rank=AI_EXAMPLES.concat(AI_EXAMPLES2).map(e=>[e,[...aiWords(e[0])].filter(w=>W.has(w)).length]).sort((a,b)=>b[1]-a[1]);
  let out=head;if(fix){out+=`[고치기 예시] 지금 배치: ${JSON.stringify(AI_FIX_PREV)}\n`;AI_FIX_EXAMPLES.forEach(([q,o])=>{out+=`고칠 점: ${q} → ${JSON.stringify({tent:o.tent,inner:o.inner,items:o.items,tip:o.tip})}\n`;});}
  for(const [[q,o]] of rank){const line=q+' → '+JSON.stringify(o)+'\n';if(out.length+line.length>AI_SYS_MAX)continue;out+=line;}
  return out;}

/* --- AI 없이: 이름 맞추기 --- */
const aiNorm=s=>String(s).toLowerCase().replace(/(\d)\s*[x×]\s*(?=\d)/g,'$1').replace(/[\s·×\-_,./()]+/g,'');
function aiKeys(ids,nameOf,modelOf){const own={},map={};
  ids.forEach(id=>{const nm=nameOf(id),w=nm.split(/\s+/);own[aiNorm(nm)]=id;
    const ks=new Set([aiNorm(modelOf(id)||'')]);(AI_ALIAS[id]||[]).forEach(a=>{const k=aiNorm(a);own[k]=id;ks.add(k);});
    for(let a=0;a<Math.min(2,w.length);a++)for(let b=w.length;b>a;b--)ks.add(aiNorm(w.slice(a,b).join(' ')));
    ks.forEach(k=>{if(k.length<2||/^[\d.]+$/.test(k))return;(map[k]=map[k]||new Set()).add(id);});});
  return Object.entries(map).map(([k,s])=>own[k]?[own[k],k]:s.size===1?[[...s][0],k]:null).filter(Boolean).sort((a,b)=>b[1].length-a[1].length);}
function aiLocal(text){
  const KN={한:1,두:2,세:3,네:4,다섯:5,여섯:6};
  let t=aiNorm(text.replace(/[x×*]\s*(\d)/gi,'$1')).replace(/(한|두|세|네|다섯|여섯)(개|장|대)/g,(m,a,b)=>KN[a]+b)
    .replace(/코너(테이블)?(양쪽|양옆|좌우|둘다|모두|lr|rl|l과r|l랑r|2개|2)/g,'코너테이블l코너테이블r').replace(/(왼쪽|좌측)코너(테이블)?|코너(테이블)?(왼쪽|좌측)/g,'코너테이블l')
    .replace(/(오른쪽|우측)코너(테이블)?|코너(테이블)?(오른쪽|우측)/g,'코너테이블r').replace(/코너테이블(?![lr])/g,'코너테이블l');
  const res={tent:null,items:[],unknown:[],tip:''};
  for(const [k,al] of Object.entries(AI_INNER_AL)){const hit=al.map(aiNorm).sort((a,b)=>b.length-a.length).find(a=>t.includes(a));if(hit){res.inner=k;t=t.split(hit).join('#');break;}}
  const tid=TENT_ORDER.filter(id=>id!=='none');
  for(const [id,n] of aiKeys(tid,id=>TENTS[id].name,id=>TENTS[id].model)){if(n.length>=2&&t.includes(n)){res.tent=id;t=t.replace(n,'#');break;}}
  const cnt={},ext=[],pos={};
  const slotCnt={};
  for(const [id,n] of aiKeys(aiIds().concat(AI_EXTS,AI_SLOTS),id=>CATALOG[id]?CATALOG[id].name:aiSlotName(id),id=>CATALOG[id]?CATALOG[id].model:getItem(id).model)){let i;
    while((i=t.indexOf(n))>=0){const m=t.slice(i+n.length).match(/^(\d{1,2})(?!\d)(개|장|대|ea)?/);const k=m?Math.max(1,+m[1]):1;
      if(pos[id]==null)pos[id]=i;t=t.slice(0,i)+'#'.repeat(n.length)+t.slice(i+n.length+(m?m[0].length:0));
      if(AI_SLOTS.includes(id))slotCnt[id]=(slotCnt[id]||0)+k;else if(AI_EXTS.includes(id)){for(let q=0;q<k;q++)ext.push(id);}else cnt[id]=(cnt[id]||0)+k;}}
  // 위치 말: 장비 이름 바로 앞뒤 12자 안의 방향어
  const raw=aiNorm(text),zoneOf=id=>{const i=pos[id];if(i==null)return null;const near=raw.slice(Math.max(0,i-12),i+20);
    return /오른쪽/.test(near)?'right':/왼쪽/.test(near)?'left':/(중앙|가운데)/.test(near)?'center':/벽/.test(near)?'wall':null;};
  const tshape=/t(모양|자)/.test(raw)?'T':'line',legM0=raw.match(/(\d{3})(높이|다리|mm)/)||raw.match(/(300|400|660|830)/),legM=legM0&&[0,[300,400,660,830].reduce((a,b)=>Math.abs(b-legM0[1])<Math.abs(a-legM0[1])?b:a)];
  if(ext.includes('mf_long')&&ext.includes('mf_reg'))ext.splice(ext.indexOf('mf_reg'),1);
  res.items=Object.entries(cnt).map(([type,count])=>({type,count,zone:zoneOf(type)}));
  if(ext.length||Object.keys(slotCnt).length){let f=res.items.find(it=>AI_ROOTS.includes(it.type));if(!f){f={type:'reg3',count:1};res.items.unshift(f);}
    f.attach=ext.map(type=>({type,shape:CATALOG[type].kind==='tray'?'line':tshape}));if(!f.zone&&ext.length)f.zone=zoneOf(ext[0]);
    f.slots=Object.entries(slotCnt).map(([id,count])=>({id,count}));}
  if(legM)res.items.filter(it=>AI_ROOTS.includes(it.type)).forEach(it=>it.leg=+legM[1]);
  return res;}

/* --- AI 호출 --- */
async function aiAsk(text,ctx){
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),25000);
  try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,
      body:JSON.stringify({system:aiSystem(ctx||text,!!ctx),prompt:(ctx?'':'내 장비: ')+text,acct:(typeof acctCode==='function'&&acctCode())||undefined})});
    const d=await r.json().catch(()=>({}));aiShowLeft(d);if(!r.ok||!d.text)return {fail:d.error==='limit'?'limit':d.error==='quota'?'quota':'error'};
    const o=JSON.parse(d.text.replace(/^```(json)?|```$/g,'').trim());return {ok:o};}
  catch(e){return {fail:'error'};}finally{clearTimeout(to);}}

function aiClean(o){const ids=new Set(aiIds()),exts=new Set(AI_EXTS),out={tent:null,items:[],unknown:[],tip:''};
  if(o&&typeof o.tent==='string'&&TENTS[o.tent]&&o.tent!=='none')out.tent=o.tent;
  if(o&&typeof o.inner==='string'){const k=o.inner.replace(/^p:/,'');if(INNER_PRESETS[k])out.inner=k;}
  const items=[],loose=[],looseS=[];
  // AI가 장비를 칸(slots)이나 inner 자리에 잘못 넣으면 장비로 옮기기
  if(o&&Array.isArray(o.items)){const more=[];o.items.forEach(it=>{if(it&&Array.isArray(it.slots))it.slots.forEach(a=>{const id=a&&(a.id||a.type);if(ids.has(id)&&!exts.has(id)&&!AI_SLOTS.includes(id)&&!AI_ROOTS.includes(id))more.push({type:id,count:a.count||1,zone:'wall'});});});
    if(typeof o.inner==='string'&&!INNER_PRESETS[o.inner.replace(/^p:/,'')]&&ids.has(o.inner))more.push({type:o.inner,count:1,zone:'inner'});o.items=o.items.concat(more);}
  (Array.isArray(o&&o.items)?o.items:[]).forEach(it=>{if(!it)return;
    if(exts.has(it.type)){for(let q=0;q<Math.min(4,Math.max(1,+it.count||1));q++)loose.push({type:it.type,shape:'line'});return;}
    if(AI_SLOTS.includes(it.type)||AI_SLOTS.includes(it.id)){looseS.push({id:it.type||it.id,count:Math.min(8,Math.max(1,+it.count||1))});return;}
    if(!ids.has(it.type))return;
    const x={type:it.type,count:Math.min(AI_MAX_EACH,Math.max(1,Math.round(+it.count||1))),zone:AI_ZONES.includes(it.zone)?it.zone:null};
    if(CATALOG[it.type].gtype==='chair'&&typeof it.at==='string'&&(ids.has(it.at)||AI_ROOTS.includes(it.at)))x.at=it.at;
    if(AI_ROOTS.includes(it.type)){x.attach=(Array.isArray(it.attach)?it.attach:[]).filter(a=>a&&exts.has(a.type)).flatMap(a=>Array(Math.min(4,Math.max(1,Math.round(+a.count||1)))).fill({type:a.type,shape:a.shape==='T'?'T':'line'})).slice(0,6);
      if(+it.leg>=200&&+it.leg<=1000)x.leg=[300,400,660,830].reduce((a,b)=>Math.abs(b-it.leg)<Math.abs(a-it.leg)?b:a);
      (Array.isArray(it.slots)?it.slots:[]).forEach(a=>{const id=a&&(a.id||a.type);if(exts.has(id))for(let q=0;q<Math.min(4,Math.max(1,+a.count||1));q++)x.attach.push({type:id,shape:'line'});});
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
    // T자 테이블을 먼저 붙여야 끝자리를 슬라이드가 먼저 차지하지 않아요
    (it.attach||[]).slice().sort((x,y)=>(y.shape==='T')-(x.shape==='T')).forEach(a=>{const ac=CATALOG[a.type],tray=ac.kind==='tray';
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
      const exAll=set.filter(p=>p!==root&&CATALOG[p.type].kind==='ext'),pr=t=>t.startsWith('mf_')?0:t.startsWith('open_')?1:2,ext=exAll.length?[exAll.slice().sort((x,y)=>pr(x.type)-pr(y.type))[0]].filter(e=>pr(e.type)<2||exAll.every(x=>pr(x.type)===2)).slice(0,1):[],fr=c.kind==='frame',host=fr&&ext.length?ext:fr?set.filter(p=>p===root||CATALOG[p.type].kind==='tray'):[root];
      const b=bbox(host.flatMap(p=>p._v)),W=b[1][0]-b[0][0],D=b[1][1]-b[0][1],horiz=W>=D,L=horiz?W:D;
      const bar=fr&&!ext.length,IN=bar?-100:-10,cwMax=Math.max(...it.seats.map(t=>CATALOG[t].w)),k=bar?Math.min(it.seats.length,3):Math.max(1,Math.floor((L+150)/(cwMax+20)));
      let sides=['+','-'];if(fr&&!ext.length){const ib=bbox(set.flatMap(p=>p._v)),fb=bbox(root._v),plus=horiz?ib[1][1]-fb[1][1]:ib[1][0]-fb[1][0],minus=horiz?fb[0][1]-ib[0][1]:fb[0][0]-ib[0][0];sides=[plus>=minus?'+':'-'];}
      const spots=[];for(let i=0;i<k;i++)sides.forEach(sd=>spots.push({sd,i}));if(!(fr&&!ext.length))spots.push({sd:'e+'},{sd:'e-'});
      const mid=[(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2],lo=horiz?b[0][0]:b[0][1],others=set.filter(p=>!host.includes(p)),taken=[];
      let si=0;it.seats.forEach(t=>{const ch=CATALOG[t],cd=ch.d,cc=centroid(ch.verts);let ok=null;
        while(!ok&&si<spots.length){const sp=spots[si++];let pos,n;
          // 옆자리는 IGT 등에 걸리면 상판 길이 방향으로 조금씩 밀어서 다시 찾아요 (T자 테이블 옆에 의자가 모이게)
          const side=sp.sd==='+'||sp.sd==='-',shifts=side?[0,...[60,120,180,240,300,360,420,480,540,600].flatMap(v=>[v,-v])]:[0,60,120,180];
          for(const sh of shifts){
          if(sp.sd==='+'||sp.sd==='-'){const a=(bar?(horiz?mid[0]:mid[1])+(sp.i-(k-1)/2)*(cwMax+60):lo+L*(sp.i+.5)/k)+sh,pp=sp.sd==='+'?(horiz?b[1][1]:b[1][0])+cd/2-IN:(horiz?b[0][1]:b[0][0])-cd/2+IN;
            pos=horiz?[a,pp]:[pp,a];n=sp.sd==='+'?(horiz?[0,1]:[1,0]):(horiz?[0,-1]:[-1,0]);}
          else{const e=sp.sd==='e+'?(horiz?b[1][0]:b[1][1])+cd/2-IN+sh:(horiz?b[0][0]:b[0][1])-cd/2+IN-sh;pos=horiz?[e,mid[1]]:[mid[0],e];n=sp.sd==='e+'?(horiz?[1,0]:[0,1]):(horiz?[-1,0]:[0,-1]);}
          const ex=n[0]?cd:ch.w,ey=n[0]?ch.w:cd,box=[[pos[0]-ex/2,pos[1]-ey/2],[pos[0]+ex/2,pos[1]-ey/2],[pos[0]+ex/2,pos[1]+ey/2],[pos[0]-ex/2,pos[1]+ey/2]];
          if(others.some(o=>satPen(box,o._v)>3)||taken.some(q=>satPen(box,q)>3))continue;
          taken.push(box);ok={pos,rot:n[1]===1?180:n[1]===-1?0:n[0]===1?90:270};break;}}
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
    const cand=[];for(let x=bb[0][0];x<=bb[1][0];x+=STEP)for(let y=bb[0][1];y<=bb[1][1];y+=STEP)cand.push([x,y]);
    if(it.zone==='inner'&&ip){const ic=centroid(ip),ib=bbox(ip);cand.unshift(ic);for(let dx=-600;dx<=600;dx+=25)for(const yy of [ic[1]])cand.push([ic[0]+dx,yy]);for(let dy=-600;dy<=600;dy+=25)cand.push([ic[0],ic[1]+dy]);}
    for(const rot of [0,90,180,270])for(const [x,y] of cand){
      const PS=aiRotPolys(it.polys,rot,[x,y]),V=PS.flat(),CV=PS.slice(0,core).flat();
      if(!V.every(v=>R.polys.some(pl=>pointInPoly(v,pl))))continue;
      if(it.zone==='inner'&&ip){if(!V.every(v=>pointInPoly(v,ip)))continue;}
      else if(ip&&PS.some(pl=>satPen(pl,ip)>3||pl.some(v=>pointInPoly(v,ip))))continue;
      if(it.zone!=='inner'&&PS.some(pl=>doors.some(d=>satPen(pl,d)>3)))continue;
      if(PS.some(pl=>polyGap(pl,R.wall)<gapW))continue;
      if(strict&&lane&&it.zone!=='inner'&&PS.some(pl=>satPen(pl,lane)>3))continue;
      const need=q=>Math.max(heat||q.heat?(strict?700:300):0,it.near&&q.seated?60:strict&&!(it.zone==='wall'&&q.zone==='wall')?WALK:60);
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
      // 테이블에 다 못 앉은 의자는 식탁 세트 바로 옆으로
      if(it.near){const sg=placed.filter(q=>q.seated);if(sg.length)s=Math.min(...sg.map(q=>Math.min(...PS.map(pl=>Math.min(...q.polys.map(qp=>polyGap(pl,qp)))))))*3+dist(ce,sg[0].c)*.3;}
      // 팬히터는 바람 나오는 앞면이 거실(가운데·식탁) 쪽을 보게
      if(CATALOG[it.type].gtype==='fan'){const th=rot*Math.PI/180,fx=-Math.sin(th),fy=Math.cos(th),tg=(placed.find(q=>q.seated)||{}).c||R.center,vx=tg[0]-ce[0],vy=tg[1]-ce[1],L=Math.hypot(vx,vy)||1;s+=(1-(fx*vx+fy*vy)/L)*600;}
      s+=rot%180?1:0; // 같은 점수면 돌리지 않은 쪽
      if(!best||s<best.s)best={s,rot,P:[x,y],PS};}}
    if(best){placed.push({polys:best.PS,heat,zone:it.zone,frame:CATALOG[it.type].kind==='frame',seated:it.seated,c:centroid(best.PS.flat())});out.push({it,rot:best.rot,P:best.P});}else miss.push(it);}
  let mx=bb[1][0]+700,my=bb[0][1];
  miss.forEach(it=>{const b=bbox(it.polys.flat()),w=b[1][0]-b[0][0],h=b[1][1]-b[0][1];out.push({it,rot:0,P:[mx-b[0][0],my-b[0][1]]});my+=h+150;});
  return {out,miss:miss.map(m=>m.type)};}

function aiApply(res){
  if(res.tent&&res.tent!==tent.id){const T=TENTS[res.tent];tent={id:res.tent,inner:T.innerDefault,canopy:false,custom:tent.custom};
    if(T.tarpJoin!=null&&!tarp.id)tarp.id='hexa_m';if(tarp.id)placeTarpDefault();renderTentList();renderTentOpts();}
  if(res.inner&&INNER_PRESETS[res.inner]){tent.inner='p:'+res.inner;tent.innerOff=null;renderTentOpts();}
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
    (b.left||[]).forEach(t=>{const lb=aiBuild({type:t});list.push({type:t,zone:'center',near:true,...lb});});});
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
/* AI 답 다듬기: 칸 파츠 개수는 글이 기준(지어낸 파츠 빼고, 빠뜨린 파츠 넣고, 두 번 들어간 것 합치기), 글에 없는 이너는 빼기 */
function aiTidy(res,said,prev,now){const L=aiLocal(said),want={};
  if(prev&&!res.tent&&prev.tent)res.tent=prev.tent;
  if(!prev){// 글에 적힌 IGT 종류와 개수를 따르기
    const lr=L.items.filter(x=>AI_ROOTS.includes(x.type)).map(x=>x.type),ar=res.items.filter(i=>AI_ROOTS.includes(i.type));
    ar.forEach(i=>{if(!lr.includes(i.type)){const m=lr.find(t=>!res.items.some(j=>j.type===t));if(m)i.type=m;}});
    L.items.forEach(x=>{if(AI_ROOTS.includes(x.type))return;const it=res.items.find(i=>i.type===x.type);if(it&&x.count>1&&it.count!==x.count)it.count=x.count;});}L.items.forEach(x=>(x.slots||[]).forEach(q=>want[q.id]=(want[q.id]||0)+q.count));
  const prevSlots={};if(prev)prev.items.forEach(it=>(it.slots||[]).forEach(q=>prevSlots[q.id]=(prevSlots[q.id]||0)+q.count));
  const roots=res.items.filter(i=>AI_ROOTS.includes(i.type)),added=[];
  roots.forEach(rt=>{const m={};(rt.slots||[]).forEach(q=>{if(want[q.id]||prevSlots[q.id])m[q.id]=(m[q.id]||0)+q.count;});rt.slots=Object.entries(m).map(([id,count])=>({id,count}));});
  Object.entries(want).forEach(([id,n])=>{const have=roots.reduce((t,rt)=>t+rt.slots.filter(q=>q.id===id).reduce((a,q)=>a+q.count,0),0);
    if(have>n&&!prev){let over=have-n;roots.slice().reverse().forEach(rt=>rt.slots.forEach(q=>{if(q.id===id&&over>0){const c=Math.min(over,q.count-0);q.count-=c;over-=c;}}));roots.forEach(rt=>rt.slots=rt.slots.filter(q=>q.count>0));}
    else if(have<n&&roots.length&&!prev){const rt=roots[0],q=rt.slots.find(x=>x.id===id);if(q)q.count+=n-have;else rt.slots.push({id,count:n-have});added.push(aiSlotName(id));}});
  // 결합 파츠(멀티펑션·하프슬라이드·코너)도 글 기준으로 맞추기
  const wantA={},prevA={};L.items.forEach(x=>(x.attach||[]).forEach(a=>wantA[a.type]=(wantA[a.type]||0)+1));
  if(prev)prev.items.forEach(it=>(it.attach||[]).forEach(a=>prevA[a.type]=1));
  roots.forEach(rt=>{const seen={};rt.attach=(rt.attach||[]).filter(a=>{if(!wantA[a.type]&&!prevA[a.type])return false;seen[a.type]=(seen[a.type]||0)+1;return prev||seen[a.type]<=wantA[a.type];});});
  if(!prev&&roots.length)Object.entries(wantA).forEach(([type,n])=>{const have=roots.reduce((t,rt)=>t+rt.attach.filter(a=>a.type===type).length,0);
    const src=L.items.flatMap(x=>x.attach||[]).find(a=>a.type===type);for(let q=have;q<n;q++)roots[0].attach.push({type,shape:src?src.shape:'line'});});
  if(prev&&now&&roots.length){const Ln=aiLocal(now);Ln.items.forEach(x=>(x.slots||[]).forEach(q=>{const have=roots.reduce((t,rt)=>t+rt.slots.filter(z=>z.id===q.id).reduce((a,z)=>a+z.count,0),0);
    if(have<q.count){const z=roots[0].slots.find(z=>z.id===q.id);if(z)z.count+=q.count-have;else roots[0].slots.push({id:q.id,count:q.count-have});}}));}
  // 글에 없는 IGT를 지어냈고 칸·결합도 없으면 빼기
  const named=new Set(L.items.map(x=>x.type));if(prev)prev.items.forEach(x=>named.add(x.type));
  res.items=res.items.filter(it=>!(AI_ROOTS.includes(it.type)&&!named.has(it.type)&&!(it.slots||[]).length&&!(it.attach||[]).length&&!L.items.some(x=>AI_ROOTS.includes(x.type))));
  // 목록에 없다고 한 장비를 비슷한 장비로 바꿔 넣었으면 빼기 (같은 종류 이름이 unknown에 있고, 글에서 그 장비 이름을 못 찾을 때)
  const unk=(res.unknown||[]).map(aiNorm).join('|');
  if(unk)res.items=res.items.filter(it=>{if(AI_ROOTS.includes(it.type)||named.has(it.type))return true;const c=CATALOG[it.type];
    const g=[c&&c.group,c&&c.gtype==='chair'&&'체어',c&&c.gtype==='chair'&&'의자',c&&c.gtype==='cot'&&'침대'].filter(Boolean).map(aiNorm);return !g.some(w=>w.length>=2&&unk.includes(w));});
  res.unknown=(res.unknown||[]).filter(u=>!/^(igt|아이지티|타프|텐트|이너|이너텐트|매트|테이블|의자|체어)$/i.test(aiNorm(u)));
  if(added.length&&!(res.added&&res.added.length))res.added=added;
  if(res.inner&&!(prev&&prev.inner===res.inner)&&L.inner!==res.inner)res.inner=L.inner||null;}
/* 오늘 남은 AI 횟수 (워커가 알려줄 때만 표시) */
function aiShowLeft(d){const el=document.getElementById('aiLeft');if(!el||!d||d.left==null)return;
  el.textContent=d.admin?'관리자 · AI 제한 없음':`오늘 남은 AI ${d.left}/${d.limit}회${d.vip?' · 초대 회원':''}`;el.hidden=false;}
async function aiCheckLeft(){try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({check:true,acct:(typeof acctCode==='function'&&acctCode())||undefined})});aiShowLeft(await r.json());}catch(e){}}
/* 대화로 고치기: 첫 세팅 뒤에는 '고칠 점'만 적으면 지금 배치를 바탕으로 다시 세팅 */
const AI_CHAT={log:[],last:null,said:''};
const aiCompact=r=>({tent:r.tent,inner:r.inner||null,items:r.items.map(it=>{const o={type:it.type};if(it.count>1)o.count=it.count;if(it.zone)o.zone=it.zone;if(it.at)o.at=it.at;
  if(it.attach&&it.attach.length)o.attach=it.attach;if(it.slots&&it.slots.length)o.slots=it.slots;if(it.leg)o.leg=it.leg;return o;}),unknown:r.unknown});
function aiChatUI(){const inp=document.getElementById('aiIn'),btn=document.getElementById('aiGo'),log=document.getElementById('aiLog'),nw=document.getElementById('aiNew');
  const on=!!AI_CHAT.last;btn.textContent=on?'✨ 고치기':'✨ AI로 세팅하기';
  inp.placeholder=on?'고칠 점을 적어요 (예: 주방을 왼쪽 벽으로, 체어 2개 더)':'예: 랜드록, IGT 롱에 플랫버너, 원액션테이블 롱, FD체어 4개';
  if(nw)nw.hidden=!on;
  if(log){log.hidden=!AI_CHAT.log.length;log.innerHTML=AI_CHAT.log.map(m=>`<p class="ai-msg ${m.who}">${aiEsc(m.t)}</p>`).join('');log.scrollTop=log.scrollHeight;}}
function aiNew(){AI_CHAT.log=[];AI_CHAT.last=null;AI_CHAT.said='';const box=document.getElementById('aiOut');if(box)box.hidden=true;document.getElementById('aiSt').textContent='';aiChatUI();document.getElementById('aiIn').focus();}
async function aiRun(){
  const inp=document.getElementById('aiIn'),btn=document.getElementById('aiGo'),st=document.getElementById('aiSt'),box=document.getElementById('aiOut');
  const text=(inp.value||'').trim().slice(0,600),fix=!!AI_CHAT.last;
  if(text.length<2){st.textContent=fix?'고칠 점을 적어주세요':'가진 장비를 먼저 적어주세요';inp.focus();return;}
  if(!fix&&state.pieces.length&&!confirm('지금 놓인 장비를 지우고 AI 세팅으로 바꿀까요? 되돌리기(↶)로 돌아갈 수 있어요.'))return;
  btn.disabled=true;st.textContent=fix?'AI가 고치는 중…':'AI가 장비를 찾는 중…';
  AI_CHAT.log.push({who:'me',t:text});aiChatUI();
  const ask=fix?`지금 배치(JSON): ${JSON.stringify(aiCompact(AI_CHAT.last))}\n고칠 점: ${text}`:text;
  let r=await aiAsk(ask,(AI_CHAT.said+' '+text).slice(-1200)),res,via='ai';
  if(r.fail==='quota'){btn.disabled=false;st.textContent='';AI_CHAT.log.push({who:'ai',t:'오늘 쓸 수 있는 AI 횟수를 다 썼어요. 지금 배치는 그대로 두었어요. 내일 다시 쓰거나, 내 장비 탭의 내 코드에 초대 코드를 넣어 주세요.'});aiChatUI();return;}
  if(fix&&!r.ok){btn.disabled=false;st.textContent='';AI_CHAT.log.push({who:'ai',t:r.fail==='limit'?'오늘 AI 사용량을 다 써서 고치지 못했어요. 끌어서 직접 다듬어 주세요.':'AI 연결이 안 돼서 고치지 못했어요. 잠시 뒤 다시 해보세요.'});aiChatUI();return;}
  inp.value='';
  if(r.ok){res=aiClean(r.ok);
    // AI가 모른다고 한 이름도 별칭으로 한 번 더 찾아보기
    res.unknown=res.unknown.filter(u=>{const l=aiLocal(u);if(l.inner&&!l.items.length){res.inner=res.inner||l.inner;return false;}if(!l.items.length)return true;
      l.items.forEach(x=>{if(x.slots&&x.slots.length||x.attach&&x.attach.length){let f=res.items.find(i=>AI_ROOTS.includes(i.type));if(f){f.slots=(f.slots||[]).concat(x.slots||[]);f.attach=(f.attach||[]).concat(x.attach||[]);return;}}
        if(x.type==='reg3'&&(x.slots||x.attach))return;const same=res.items.find(i=>i.type===x.type);if(same)return;res.items.push({type:x.type,count:x.count,zone:null});});return false;});if(!res.items.length&&!res.tent){const l=aiLocal(text);if(l.items.length){res=l;via='local';}}}
  else{res=aiLocal(text);via=r.fail==='limit'?'limit':'local';}
  if(via==='ai')aiTidy(res,AI_CHAT.said+' '+text,fix?AI_CHAT.last:null,text);
  btn.disabled=false;
  if(!res.items.length&&!res.tent){st.textContent='';box.hidden=false;
    box.innerHTML=`<p class="ai-warn">목록에서 맞는 장비를 못 찾았어요. ‘장비 제원’ 탭의 이름으로 적어보세요 (예: 폴딩쉘프, IGT 롱, 체어원).</p>`;return;}
  if(typeof camEv==='function'){camEv(fix?'ai-fix':via==='ai'?'ai-run':'ai-local',fix?'AI 고치기':via==='ai'?'AI 세팅':'AI 대신 이름 맞추기');
    res.unknown.slice(0,5).forEach(u=>{const n=String(u).replace(/[\n\r/]/g,' ').trim().slice(0,30);if(n)camEv('ai-unknown/'+encodeURIComponent(n),n);});}
  const miss=aiApply(res);AI_CHAT.last=res;AI_CHAT.said=(AI_CHAT.said+' '+text).slice(-1200);
  AI_CHAT.log.push({who:'ai',t:(res.tip||(fix?'고쳤어요.':'세팅했어요.'))+(res.added&&res.added.length?` (${res.added.join(', ')}은 목록에 있어서 IGT 칸에 넣었어요.)`:'')});aiChatUI();
  st.textContent=via==='ai'?'세팅했어요. 끌어서 다듬어 보세요':'기본 자동 배치로 세팅했어요';
  const nm=id=>aiEsc(CATALOG[id].name),ZN={center:'가운데',wall:'벽쪽',inner:'이너룸',left:'왼쪽',right:'오른쪽',top:'위쪽',bottom:'아래쪽'};
  let h='';
  if(via!=='ai')h+=`<p class="ai-note">${via==='limit'?'오늘 AI 사용량이 많아서':'AI 연결이 안 돼서'} 이름이 같은 장비만 찾아 놓았어요.</p>`;
  h+=`<ul class="ai-got">${res.tent?`<li class="ai-tent">⛺ ${aiEsc(aiTentName(res.tent))}</li>`:''}${res.inner?`<li class="ai-tent">⛺ 이너: ${aiEsc(INNER_PRESETS[res.inner].name)}</li>`:''}${res.items.map(it=>`<li>${nm(it.type)}${it.attach&&it.attach.length?' + '+Object.entries(it.attach.reduce((m,a)=>{const k=nm(a.type)+(a.shape==='T'?' (T자)':'');m[k]=(m[k]||0)+1;return m;},{})).map(([k,n])=>k+(n>1?' ×'+n:'')).join(' + '):''}${it.count>1?` <b>×${it.count}</b>`:''}${it.slots&&it.slots.length?' · 칸: '+it.slots.map(sl=>aiEsc(aiSlotName(sl.id))+(sl.count>1?' ×'+sl.count:'')).join(', '):''}${it.leg?` · ${it.leg}다리`:''}${it.zone&&it.zone!==aiZone(it.type)?` · ${ZN[it.zone]}`:''}</li>`).join('')}</ul>`;
  if(aiApply.over&&aiApply.over.length)h+=`<p class="ai-warn">자리가 모자라 IGT에 못 붙인 파츠: ${[...new Set(aiApply.over)].map(id=>aiEsc(CATALOG[id]?CATALOG[id].name:aiSlotName(id))).join(', ')}</p>`;
  if(miss.length)h+=`<p class="ai-warn">자리가 모자라 텐트 밖 오른쪽에 둔 장비: ${[...new Set(miss)].map(nm).join(', ')}</p>`;
  if(res.unknown.length)h+=`<div class="ai-unk"><p class="ai-warn">장비 제원에 아직 없어서 빼둔 장비예요. 비슷한 장비로 바꾸지 않았어요.</p><p>${res.unknown.map(u=>`<button type="button" class="rq-ask" data-n="${aiEsc(u)}" onclick="reqAsk(this)">${aiEsc(u)} · 추가 요청</button>`).join('')}</p></div>`;
  h+=`<p class="ai-next">더 바꿀 게 있으면 위 칸에 적고 ‘고치기’를 눌러요.</p>`;
  box.innerHTML=h;box.hidden=false;
  const b=document.getElementById('board');if(b&&b.scrollIntoView&&innerWidth<900)setTimeout(()=>b.scrollIntoView({behavior:'smooth',block:'start'}),400);}

/* --- 게시판: 공지사항 · 장비 요청 · 개발 요청 (워커 KV에 저장, 매주 일요일 확인 후 반영) --- */
const RQ_ST={gear:{new:'확인 중',ok:'확인됨',sun:'일요일 추가 예정',done:'추가됨',no:'추가 어려움'},dev:{new:'확인 중',ok:'확인됨',sun:'일요일 반영 예정',done:'반영됨',no:'반영 어려움'}};
let RQ=null,NT=null,BD_TAB='notice',RQ_MINE=new Set();try{RQ_MINE=new Set(JSON.parse(localStorage.getItem('rqMine')||'[]'));}catch(e){}
const rqSave=()=>{try{localStorage.setItem('rqMine',JSON.stringify([...RQ_MINE].slice(-200)));}catch(e){}};
async function rqCall(b){try{const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({board:b})});const d=await r.json().catch(()=>({}));return r.ok?d:{fail:d.error||'error'};}catch(e){return {fail:'error'};}}
function bdShow(k){BD_TAB=k;['notice','gear','dev'].forEach(x=>{const t=document.getElementById('bdt-'+x),p=document.getElementById('bd-'+x);if(t)t.setAttribute('aria-selected',x===k);if(p)p.hidden=x!==k;});reqRender();}
function bdOpen(k){go('board');bdShow(k);}
const rqDate=s=>String(s||'').slice(5).replace('-','.');
function reqRender(){
  const nt=document.getElementById('ntList');
  if(nt){nt.innerHTML=NT==null?(RQ===false?'<li class="rq-empty">게시판을 준비하고 있어요. 곧 공지와 요청을 볼 수 있어요.</li>':'<li class="rq-empty">불러오는 중…</li>'):!NT.length?'<li class="rq-empty">아직 공지사항이 없어요.</li>':
    NT.map(n=>`<li class="${n.pin?'pin':''}"><details${n.pin?' open':''}><summary>${n.pin?'<span class="nt-pin">고정</span>':''}<b>${aiEsc(n.title)}</b><small>${aiEsc(rqDate(n.at))}</small></summary><p>${aiEsc(n.body||'').replace(/\n/g,'<br>')}</p></details></li>`).join('');}
  ['gear','dev'].forEach(kind=>{const ul=document.getElementById('rqList-'+kind);if(!ul)return;
    if(!RQ){ul.innerHTML=RQ===false?'<li class="rq-empty">게시판을 준비하고 있어요. 곧 공지와 요청을 볼 수 있어요.</li>':'';return;}
    const L=RQ.filter(r=>(r.kind||'gear')===kind);
    if(!L.length){ul.innerHTML='<li class="rq-empty">아직 요청이 없어요. 첫 요청을 남겨주세요.</li>';return;}
    ul.innerHTML=L.slice(0,80).map(r=>`<li><div class="rq-n"><b>${aiEsc(r.name)}</b>${r.link?` <a href="${aiEsc(r.link)}" target="_blank" rel="noopener nofollow">링크</a>`:''}<small>${aiEsc(rqDate(r.at))}</small>${r.note?`<p>${aiEsc(r.note)}</p>`:''}${r.reply?`<p class="rq-re">↳ ${aiEsc(r.reply)}</p>`:''}</div>
      <span class="rq-badge s-${aiEsc(r.st)}">${RQ_ST[kind][r.st]||'확인 중'}</span>
      <button type="button" class="rq-plus" ${RQ_MINE.has(r.id)||r.st==='done'||r.st==='no'?'disabled':''} onclick="reqPlus('${aiEsc(r.id)}')" aria-label="${aiEsc(r.name)} 나도 필요해">나도 필요해 ${r.n||1}</button></li>`).join('');});}
async function reqLoad(force){if(RQ&&NT&&!force){reqRender();return;}
  const d=await rqCall({op:'list'});if(d.fail){RQ=false;reqRender();return;}
  RQ=d.items||[];NT=d.notices||[];reqRender();}
async function reqAdd(kind,name,link,note,from){const d=await rqCall({op:'add',kind,name,link,note,from});
  if(d.ok){RQ=d.items;if(d.notices)NT=d.notices;RQ_MINE.add(d.id);rqSave();reqRender();if(typeof camEv==='function')camEv('req-'+kind+'/'+encodeURIComponent(String(name).slice(0,30)),kind==='dev'?'개발 요청':'장비 추가 요청');}
  return d;}
async function reqSend(kind){const n=document.getElementById('rqName-'+kind),l=document.getElementById('rqLink-'+kind),t=document.getElementById('rqNote-'+kind),st=document.getElementById('rqSt-'+kind);
  const name=n.value.trim();if(name.length<2){st.textContent=kind==='dev'?'한 줄 요약을 적어주세요':'장비 이름을 적어주세요';n.focus();return;}
  st.textContent='보내는 중…';const d=await reqAdd(kind,name,l?l.value.trim():'',t?t.value.trim():'','form');
  st.textContent=d.ok?'요청했어요. 일요일에 확인할게요.':d.fail==='quota'?'오늘은 요청을 많이 보냈어요. 내일 다시 남겨주세요.':'보내지 못했어요. 잠시 뒤 다시 해주세요.';
  if(d.ok){n.value='';if(l)l.value='';if(t)t.value='';}}
async function reqPlus(id){if(RQ_MINE.has(id))return;const d=await rqCall({op:'plus',id});if(d.ok){RQ=d.items;RQ_MINE.add(id);rqSave();reqRender();}}
async function reqAsk(b){b.disabled=true;const t=b.textContent;b.textContent='보내는 중…';const d=await reqAdd('gear',b.dataset.n,'','','ai');
  b.textContent=d.ok?`${b.dataset.n} · 요청했어요 (일요일에 확인)`:d.fail==='quota'?'오늘 요청을 많이 보냈어요':'보내지 못했어요';if(!d.ok)setTimeout(()=>{b.disabled=false;b.textContent=t;},2500);}
