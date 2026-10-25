# 캠테리어 CAMTERIOR

**Camp + Interior.** 텐트 바닥 도면 위에 IGT·선반·난로를 실제 크기(mm)로 먼저 배치해 보는 캠핑 인테리어 플래너입니다.

👉 **https://camterior.github.io/**

| 탭 | 내용 |
|---|---|
| 소개 | 캠테리어가 무엇인지, 세 단계 사용법, 기능 |
| 내부 구성 | 텐트·타프·IGT·장비 배치, 안전거리 점검, 3D(낮·노을·밤), 되돌리기, 인스타 카드, 공유 링크 |
| 장비 제원 | 텐트 12종·타프·IGT 프레임/테이블/파츠·수납·난방의 크기와 출처 |
| 캠핑 허브 | [CARO](https://caro-camp.github.io/)(예약 오픈 알림) 등 연계 페이지, 모두의 배치·후기 |

- 개인정보를 수집하지 않습니다. 배치는 브라우저(localStorage)에만 저장되고, 공유 링크에는 배치 데이터만 담깁니다.
- 규격 출처: 아이엘캠프·오캠프 상품 상세, 제조사 공식 페이지·카탈로그. 일부(‘사진추정’, ‘도면 추정’)는 근사값입니다.
- 이미지: Higgsfield AI로 생성. 브랜드명은 각 제조사의 상표이며 이 프로젝트는 제조사와 관계가 없습니다.

## 구조
- `index.html` 앱 전체(플래너 코드 포함) · `img/` 사진(webp) · `assets/` 폰트(Pretendard 서브셋)·아이콘
- `sw.js` 오프라인 캐시 · `scripts/smoke.js` 배포 전 브라우저 검사
- 배포: `main`에 푸시 → GitHub Actions가 검사 후 Pages에 올림(`.github/workflows/deploy.yml`). 검사 실패 시 지금 사이트 유지.

## 크레딧
Pretendard (SIL OFL 1.1) · three.js (MIT)
