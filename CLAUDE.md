# 캠테리어 작업 규칙 (Claude용)

홍중이 정한 규칙이에요. 이 저장소에서 작업할 때 항상 따릅니다.

## 1. 항상 백업
- 작업을 시작하기 전에 지금 `main`을 `backup-YYYYMMDD` 브랜치로 남깁니다 (같은 날 여러 번이면 `backup-YYYYMMDD-2`).
- 되돌리기: 백업 브랜치의 파일을 `main`으로 되살리거나 `git revert <커밋>`.

## 2. 새 작업은 따로 경로에서
- 새 기능·디자인 변경은 `main`에서 바로 하지 않고 `work/<짧은-이름>` 브랜치에서 합니다 (예: `work/springbar-tents`).
- `main`에 푸시하면 바로 사이트(GitHub Pages)에 배포되므로, 확인 전에는 `main`에 넣지 않습니다.

## 3. 적용 전에 먼저 보여주기
- 작업 브랜치에서 휴대폰·PC 화면 캡처(필요하면 미리보기 페이지)를 홍중에게 보여줍니다.
- 홍중이 "적용해/배포해"라고 하면 그때 `main`에 합치고 푸시합니다.
- 마음에 안 들면 브랜치를 버리면 되고, `main`(실제 사이트)은 그대로입니다.

## 4. 배포
- `main` 푸시 → `.github/workflows/deploy.yml`이 `scripts/smoke.js`(4개 탭 열기 검사)를 통과해야 배포됩니다. 실패하면 지금 사이트가 유지됩니다.
- 푸시 전 직접 검사: `node scripts/smoke.js` (playwright 필요).

## 참고
- 이 저장소의 `index.html`은 빌드 결과물입니다. 원본(플래너 v18 + 탭 껍데기 `shell.html`·`tabs.css`·`tabs.js` + `build.py`)은 작업 세션에 있습니다. 원본이 없을 때는 `index.html`을 직접 고칩니다.
- 답변과 커밋 메시지는 한글로.
