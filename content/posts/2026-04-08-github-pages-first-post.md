---
title: GitHub Pages에 배포하는 SvelteKit 블로그
description: adapter-static과 prerender 설정으로 SvelteKit을 GitHub Pages에 올리는 기본 구조를 정리합니다.
date: 2026-04-08
published: true
category: Technical
cover: /uploads/covers/editorial-grid.svg
---

GitHub Pages는 서버 런타임을 제공하지 않기 때문에, SvelteKit 프로젝트를 올리려면 **정적 사이트로 완전히 빌드**해야 합니다.

이번 프로젝트는 `@sveltejs/adapter-static`을 사용해 모든 페이지를 prerender하고, GitHub Actions가 `build/` 산출물을 Pages에 배포하도록 구성했습니다.

## 이번 설정에 포함된 것

- `adapter-static` 전환
- GitHub Pages용 base path 처리
- `trailingSlash = 'always'` 설정
- 전체 포스트를 Markdown에서 읽어 정적 페이지 생성
- Pages CMS에서 바로 편집할 수 있는 `.pages.yml`

## 왜 trailing slash가 필요한가

GitHub Pages에서는 `/blog/post/`처럼 디렉터리 기반 URL이 다루기 쉽습니다.  
`trailingSlash = 'always'`를 사용하면 각 포스트가 `index.html`로 출력되어 새로고침이나 직접 접근 시에도 안정적으로 열립니다.

## 콘텐츠는 어디에 있나

포스트는 `content/posts`에 Markdown 파일로 저장됩니다.
각 파일은 frontmatter와 본문으로 구성되고, 빌드 시 목록 페이지와 상세 페이지가 생성됩니다.

## 다음 단계

이제 저장소를 GitHub에 올리고 Pages를 `GitHub Actions`로 설정하면 됩니다.  
그다음 Pages CMS에 로그인하면 `.pages.yml`을 읽어 포스트와 사이트 설정을 바로 편집할 수 있습니다.
