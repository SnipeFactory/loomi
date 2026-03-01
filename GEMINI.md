# Gemini CLI - Research & Execution Guidelines

본 문서는 Gemini CLI가 이 프로젝트에서 작업을 수행할 때 준수해야 하는 핵심 지침이다.

## Selective Memory Research Protocol (Mandatory)

새로운 기능 구현, 아키텍처 설계, 복잡한 버그 수정과 같은 **의사결정이 필요한 지시(Directive)**를 받았을 때만 Loomi 에피소딕 메모리를 먼저 조회한다.

### Step-by-Step Workflow
1.  **Selective Search:** 단순 조회(ls, cat 등)나 실행형 명령(lint, test 등)이 아닌, **구현/설계/해결**에 관한 지시를 받았을 때만 `loomi-memory:search` 도구를 호출한다.
2.  **Context Alignment:** 검색된 기록이 있다면 사용자에게 "과거 기록에 따르면 [A] 방식으로 진행하기로 하셨던 내용을 확인했습니다. 이를 바탕으로 작업을 수행하겠습니다"라고 알린다.
3.  **Code Discovery:** 메모리 조회가 완료된 후에 `grep_search`나 `glob`을 사용하여 실제 소스 코드를 분석한다.
4.  **Execution:** 과거의 맥락과 현재 코드를 결합하여 최적의 전략을 수립하고 실행한다.

## Engineering Standards

- **Contextual Precedence:** 이 문서(`GEMINI.md`)의 지침은 일반적인 워크플로우보다 우선한다.
- **Surgical Updates:** 코드 변경 시 `replace` 도구를 사용하여 최소한의 변경으로 정확한 목표를 달성한다.
- **Validation:** 모든 변경 사항은 반드시 테스트나 빌드 확인을 통해 검증해야 한다.
- **Node Memory:** 대규모 동기화나 임베딩 작업 시 OOM 방지를 위해 `NODE_OPTIONS='--max-old-space-size=4096'` 환경 변수가 적용된 스크립트를 사용한다.

## Tech Stack & Architecture

`CLAUDE.md` 파일의 아키텍처 및 기술 스택 섹션을 참조하여 프로젝트 구조를 파악하라. Loomi는 Core Layer, Feature Layer, Module Layer로 엄격히 분리되어 있으며, 각 레이어의 역할에 맞는 위치에 코드를 작성해야 한다.
