# Private PDF Studio

이미지를 PDF로 만들고 PDF를 나누거나 병합하는 GitHub Pages 배포용 Next.js 앱입니다.

## 개인정보 설계

- 선택한 이미지/PDF 파일은 브라우저 메모리에서만 처리됩니다.
- PDF 변환, 분할, 병합은 `pdf-lib`를 사용해 클라이언트에서 실행됩니다.
- 파일 바이트를 API Route, Server Action, Storage, GitHub 서버로 보내지 않습니다.
- GitHub Pages는 HTML/CSS/JS 정적 파일만 호스팅합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 됩니다.

## GitHub Pages 배포

이 저장소는 `.github/workflows/pages.yml`로 GitHub Pages 배포를 자동화합니다.

1. GitHub 저장소의 `Settings`로 이동합니다.
2. 왼쪽 메뉴에서 `Pages`를 엽니다.
3. `Build and deployment`의 `Source`를 `GitHub Actions`로 선택합니다.
4. `main` 브랜치에 push하면 Actions가 `out` 폴더를 배포합니다.

배포 주소는 보통 아래와 같습니다.

```text
https://uisu-dev.github.io/private-pdf-studio/
```

## 주요 기능

- 이미지 여러 장을 A4 PDF로 변환
- PDF에서 `1-3, 5, 8` 같은 페이지 범위만 추출
- 여러 PDF를 순서 조정 후 병합
- 결과 PDF를 로컬로 다운로드
