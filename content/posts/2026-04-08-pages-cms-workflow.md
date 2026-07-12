---
id: eb19e667-4448-427e-81b0-c6bbe8faadc6
title: Pages CMS로 정적 콘텐츠 워크플로우 설계하기
description: Git 저장소를 그대로 CMS처럼 사용하면서 사이트 설정과 글을 함께 관리하는 운영 흐름을 소개합니다.
date: 2026-04-07
published: true
category: Essays
---

Pages CMS는 별도 데이터베이스 없이 **GitHub 저장소의 파일을 직접 편집**하는 방식으로 동작합니다.

이 프로젝트에서는 루트의 `.pages.yml`이 다음 두 가지를 연결합니다.

## 1. 포스트 컬렉션

`content/posts` 폴더를 컬렉션으로 등록해 새 글을 만들고 기존 글을 수정할 수 있습니다.
`title`, `description`, `date`, `cover`, `body` 같은 필드를 UI에서 다루고, 저장하면 실제 Markdown 파일이 커밋됩니다.

## 2. 사이트 설정 파일

`content/site.json`을 별도 파일 편집기로 연결해 블로그 이름, 설명, URL 같은 메타 정보를 CMS에서 수정할 수 있습니다.

## 이미지 업로드

업로드 경로는 `static/uploads`입니다.  
본문 이미지는 `/uploads/...` 경로로 저장되고, 빌드 후 GitHub Pages에서도 같은 경로로 접근할 수 있습니다.

## 운영 방식

1. Pages CMS에서 글을 수정합니다.
2. 변경 사항이 저장소에 커밋됩니다.
3. `main` 브랜치에 푸시되면 GitHub Actions가 다시 빌드합니다.
4. 최신 정적 산출물이 GitHub Pages에 배포됩니다.

정리하면, 에디터 경험은 CMS처럼 유지하면서 실제 소스 오브 트루스는 계속 Git에 남는 구조입니다.
