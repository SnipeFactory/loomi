# 전역 에이전트 가이드라인 (Global Agent Guidelines)

이 문서는 Gemini CLI와 Claude Code가 공통으로 사용할 **선택적 메모리 리서치 프로토콜**을 정리한 것입니다. 각 에이전트의 전역 설정 파일에 복사하여 사용하세요.

---

### 1. Gemini CLI용 (~/.gemini/GEMINI.md)

```markdown
# Global Research & Execution Protocol

## Selective Memory Research (Mandatory)

새로운 기능 구현, 아키텍처 설계, 복잡한 버그 수정과 같은 **의사결정이 필요한 지시(Directive)**를 받았을 때만 Loomi 에피소딕 메모리를 먼저 조회한다.

### Step-by-Step Workflow
1.  **Selective Search:** 단순 조회(ls, cat 등)나 실행형 명령(lint, test 등)이 아닌, **구현/설계/해결**에 관한 지시를 받았을 때만 `loomi-memory:search` 도구를 사용한다.
2.  **Context Alignment:** 과거의 결정 사항, 기술 스택 선택 이유, 이전에 시도했던 해결책이 검색되면 사용자에게 "과거 기록에 따르면 [A] 방식으로 진행하기로 하셨던 내용을 확인했습니다"라고 알리고 작업을 시작한다.
3.  **Efficiency:** 불필요한 검색을 줄여 토큰 사용량을 최적화하고 속도를 유지한다.

## Engineering Standards
- **Surgical Updates:** 코드 변경 시 `replace` 도구를 사용하여 최소한의 변경으로 정확한 목표를 달성한다.
- **Validation:** 모든 변경 사항은 반드시 테스트나 빌드 확인을 통해 검증해야 한다.
```

---

### 2. Claude Code용 (~/.claude/CLAUDE.md)

```markdown
# Global Claude Instructions

## Selective Memory Research (Mandatory)

Claude Code는 새로운 작업을 시작하기 전에 반드시 Loomi의 에피소딕 메모리를 먼저 조회해야 한다. 단, 단순 조회나 실행형 명령은 제외하고 **의사결정 및 구현(Directive)**이 필요한 경우에만 수행한다.

### Research Protocol
1.  **조회 시점:** 새로운 기능 구현, 복잡한 버그 수정, 아키텍처 변경 등의 지시를 받았을 때.
2.  **방법:** `loomi-memory:search` 도구를 사용하여 관련 키워드로 과거 대화를 검색한다.
3.  **활용:** 검색된 기록이 있다면 사용자에게 "과거 기록([날짜/세션])에 따르면 ~라고 결정하셨던 내용을 바탕으로 진행하겠습니다"라고 언급하며 작업을 시작한다.
4.  **심층 분석:** 검색 결과가 부족할 경우 `loomi-memory:show`를 사용하여 전체 맥락을 확인한다.
```
