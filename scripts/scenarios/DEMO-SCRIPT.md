# Loomi 데모 영상 촬영 스크립트

> **실제 Loomi 개발 세션 기반** — 씨드 데이터 없이 실제 기록으로 촬영 가능.
> 시나리오 A, C는 실제 세션(`380fa9e1`, `f116f3f6`)이 이미 인덱싱되어 있음.
> 시나리오 B는 Gemini CLI 실행 환경 필요.

---

## 시나리오 A: "OOM 크래시, 그리고 기억" ⏱ ~2분

**핵심 메시지:** AI가 과거 자신의 디버깅 경험을 기억해 다음 문제를 즉시 해결한다.

### 준비
```bash
npm run dev
# 씨드 불필요 — 380fa9e1 세션이 실제로 인덱싱되어 있음
```

### 촬영 순서

**[장면 1] 30초 — 문제 설정**
- 화면: Loomi 대시보드 → Session Explorer
- Session "임베딩 메모리 최적화 — TTL 기반 자동 unload" 클릭 (380fa9e1)
- 스크롤해서 OOM 관련 컨텍스트 보여줌 (Turbopack + ONNX 동시 메모리 5.8GB)
- **자막:** "어제, 실제 OOM 문제"

**[장면 2] 20초 — 오늘 또 같은 문제**
- 새 Claude Code 세션 열기
- 타이핑:
  ```
  Turbopack 올리고 나서 또 메모리 문제가 생겼어.
  ONNX 워커 분리하려는데 예전에 임베딩 메모리
  어떻게 해결했었지?
  ```

**[장면 3] 40초 — Loomi MCP 검색 (핵심)**
- Claude가 자동으로 `loomi-memory:search` 호출
- **실제 작동 쿼리:**
  ```
  query: "TTL unload dispose embedding"
  mode: "text"
  ```
- **실제 검색 결과:**
  ```
  발견: 380fa9e1 | score 14.9 (fts)
  "임베딩 메모리 최적화 — TTL 기반 자동 unload"
  Context: 두 모델 합산 ~5.8GB → TTL 10분 → 유휴 시 ~0.5GB
  "장기 방향: IPC 기반 워커 프로세스 분리 ← 지금 하려는 게 바로 이것"
  ```
- **자막:** "어제 대화에서 이미 결론 내려뒀음"

**[장면 4] 30초 — 즉각 실행**
- Claude: "당시에 이미 워커 분리를 '장기 방향'으로 명시해뒀습니다. `child_process.fork()` + IPC 설계 시작할까요?"
- **자막:** "과거 결정이 현재 작업의 출발점"

---

## 시나리오 B: "Gemini가 Claude 기억을 읽다" ⏱ ~1.5분

**핵심 메시지:** 어떤 AI 도구를 쓰든 모든 대화가 한 곳에 모인다.

### 준비
```bash
# Loomi 서버 실행 중이어야 함
# Gemini CLI에 Loomi MCP 등록 확인
cat ~/.gemini/settings.json | grep loomi
```

### 촬영 순서

**[장면 1] 20초 — 도구 전환**
- 분할 화면: 왼쪽 Claude Code 터미널, 오른쪽 Gemini CLI 터미널
- 또는 Gemini CLI 단독
- **자막:** "어제, Claude로 설계한 언어 감지 로직"

**[장면 2] 15초 — Loomi 상태 확인**
- Gemini CLI에서:
  ```
  루미 메모리 상태 알려줘
  ```
- Gemini가 `loomi-memory:status` 호출
- 응답: "9,274개 메시지, 99.6% 색인"

**[장면 3] 40초 — Cross-AI 검색 (핵심)**
- 타이핑:
  ```
  언어 감지 로직이 어떻게 구현됐는지 기억 못해.
  Claude랑 얘기했던 거 같은데 찾아봐줘
  ```
- Gemini가 `loomi-memory:search` 호출
- **실제 작동 쿼리:**
  ```
  query: "franc sco eng threshold"
  mode: "text"
  ```
- **실제 검색 결과:**
  ```
  발견: 380fa9e1 | Claude CLI 세션
  "franc + 85% threshold로 sco/eng 오분류 방지"
  "francAll 결과에서 설정된 언어를 우선 찾고, 상위 점수의 85% 이상이면 채택"
  ```
- **자막:** "Claude와 나눈 대화를 Gemini가 찾아낸다"

**[장면 4] 15초 — 클로징**
- Gemini가 요약 응답 + "이 대화는 Claude CLI에서 이뤄졌지만 Loomi가 수집해서 저도 검색할 수 있습니다"
- Loomi 대시보드에서 해당 세션 클릭 → Claude 세션 내용 확인
- **자막:** "Claude, Gemini, Cursor — 모든 AI의 기억을 한 곳에"

---

## 시나리오 C: "신규 팀원도 컨텍스트 바로 파악" ⏱ ~1분

**핵심 메시지:** 팀의 아키텍처 결정이 코드가 아닌 대화에 있다. Loomi가 그걸 찾아준다.

### 준비
```bash
npm run dev
# 씨드 불필요 — f116f3f6 세션이 실제로 인덱싱되어 있음
```

### 촬영 순서

**[장면 1] 20초 — 의문**
- 새 Claude Code 세션
- 타이핑:
  ```
  Loomi 코드 보니까 확장 시스템이 'Module'인데,
  보통은 Plugin이라고 하잖아. 왜 Module이야?
  ```

**[장면 2] 30초 — 과거 결정 복원**
- Claude가 `loomi-memory:search` 호출
- **실제 작동 쿼리:**
  ```
  query: "Plugin Module rename"
  mode: "text"
  ```
- **실제 검색 결과:**
  ```
  발견: f116f3f6 | score 16.5 (fts)
  "플러그인 → 모듈 전체 리네이밍"
  Context: Loomi 내부 "플러그인"이 외부 "Claude Code 플러그인"과 혼동됨
           → "모듈(Module)"로 명확히 분리
  ```
- 응답:
  ```
  결정 이유:
  - 'Claude Code 플러그인'이랑 이름이 겹쳐서 혼동 발생
  - NestJS/Nuxt도 서버사이드 확장을 Module이라 부름
  - 외부 'Claude Code 플러그인'은 여전히 Plugin으로 유지
  ```

**[장면 3] 10초 — 클로징**
- **자막:** "CLAUDE.md에 없는 결정 이유도 대화에 있다"

---

## 촬영 팁

### 필수 화면 설정
```bash
# 폰트 크기 키우기 (터미널)
# 창 크기 좁게 (1280x720 or 1920x1080)
# 다크 모드 켜기
```

### 검색 사전 테스트 (촬영 전 필수)
```bash
# 시나리오 A: TTL 임베딩 최적화
curl -s "http://localhost:2000/api/memory?q=TTL+unload+dispose+embedding&mode=text&limit=3"

# 시나리오 B: franc 언어 감지 (sco/eng 오분류 수정)
curl -s "http://localhost:2000/api/memory?q=franc+sco+eng+threshold&mode=text&limit=3"

# 시나리오 C: Plugin → Module 리네이밍
curl -s "http://localhost:2000/api/memory?q=Plugin+Module+rename&mode=text&limit=3"
```

> **주의:** `mode=both`는 한국어 FTS 미지원 + 특수문자(`5.8GB` 등) 파싱 오류로 검색 실패.
> 기술 용어 검색은 반드시 `mode=text`(FTS) 사용.

### 시나리오별 추천 녹화 도구
- **시나리오 A, C:** OBS + Claude Code 터미널 전체화면
- **시나리오 B:** OBS 분할 화면 (왼쪽: Claude / 오른쪽: Gemini or Loomi UI)

---

## 최종 편집 순서 (추천)

```
[인트로 5초] Loomi 로고 + "모든 AI의 기억을 한 곳에"

[시나리오 B] 1.5분 — 가장 직관적, 관심 잡기
  → "Gemini가 Claude 기억을 찾는다"

[시나리오 A] 2분 — 실용적 가치 증명
  → "OOM 크래시, 기억에서 답 찾기"

[시나리오 C] 1분 — 팀 사용 케이스
  → "신규 팀원 온보딩"

[아웃트로 5초] loomi.dev 또는 GitHub 링크
```

**총 영상 길이:** ~5분
