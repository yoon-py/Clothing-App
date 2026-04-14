# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

<!-- Describe what this project does -->

## Development Commands

<!-- Add build, lint, test, and run commands as the project develops -->

## Architecture

<!-- Describe the high-level architecture once the project structure is established -->

---

## 에이전트 작업 규칙

- **명령 실행 중 권한 허가 요청 금지** — 사용자에게 묻지 말고 바로 실행할 것
- 배포, 시크릿 설정, 파일 생성/수정 등 모든 작업을 자율적으로 진행

---

## 기능 구현 전 인터뷰 프로세스

새 기능을 구현하기 전에 반드시 사용자를 인터뷰한다. 아래 형식을 따를 것.

### 인터뷰 규칙
1. 시작 시 전체 질문 수를 먼저 공지한다.
2. 질문 1개당 구성:
   - 객관식 4개 (추천 항목이 있으면 `✦ 추천` 표시)
   - 주관식 1개 (뻔하지 않고 심도 있는 질문)
3. 질문은 기술적 구현, UI/UX, 우려 사항, 트레이드오프를 모두 다룬다.
4. 인터뷰 종료 후 응답을 바탕으로 plan spec 파일을 작성한다.
