# Private PDF Studio

이미지를 PDF로 만들고 PDF를 나누거나 병합하는 Vercel 배포용 Next.js 앱입니다.

## 개인정보 설계

- 선택한 이미지/PDF 파일은 브라우저 메모리에서만 처리됩니다.
- PDF 변환, 분할, 병합은 `pdf-lib`를 사용해 클라이언트에서 실행됩니다.
- 파일 바이트를 Next.js API Route, Server Action, Supabase Storage, Vercel 서버로 보내지 않습니다.
- Supabase는 클라이언트 연결 준비만 포함되어 있으며, 업로드 자료 저장에는 사용하지 않습니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 됩니다.

## Supabase 설정

Supabase 프로젝트를 만들고 Vercel 환경 변수에 아래 값을 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

이 앱은 개인정보 보호를 위해 Supabase Storage 버킷을 사용하지 않습니다. 나중에 로그인, 결제, 사용량 제한 같은 기능을 추가하더라도 업로드 파일 자체는 저장하지 않는 원칙을 유지하는 편이 좋습니다.

## Vercel 배포

1. GitHub 저장소에 이 프로젝트를 올립니다.
2. Vercel에서 저장소를 Import합니다.
3. Framework Preset은 Next.js로 둡니다.
4. Supabase 환경 변수를 추가합니다.
5. Deploy를 실행합니다.

## 주요 기능

- 이미지 여러 장을 A4 PDF로 변환
- PDF에서 `1-3, 5, 8` 같은 페이지 범위만 추출
- 여러 PDF를 순서 조정 후 병합
- 결과 PDF를 로컬로 다운로드
