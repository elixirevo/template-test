---
id: eb19e667-4448-427e-81b0-c6bbe8faadc6
title: Pages CMSを使用した静的コンテンツのワークフロー設計
description: GitリポジトリをそのままCMSのように活用し、サイト設定と記事を同時に管理する運用フローをご紹介します。
date: '2026-04-07'
published: true
category: Essays
locale: ja
sourcePath: content/posts/2026-04-08-pages-cms-workflow.md
sourceHash: d76b4e4be8db4767d172bbdc1f2fee694a8104883cfaec1f95b2ae7ce2c42873
sourceLocale: ko
translationSchemaVersion: markdown-xml-v2
translationSource: deepl
translatedAt: '2026-04-11T04:28:10.985Z'
---
Pages CMSは、別途データベースを使用せず、**GitHubリポジトリ内のファイルを直接編集**する方式で動作します。

このプロジェクトでは、ルートディレクトリにある `.pages.yml` が以下の2つを結びつけています。

## 1. 投稿コレクション

`content/posts`フォルダをコレクションとして登録することで、新しい記事を作成したり、既存の記事を編集したりできます。 `title`、`description`、`date`、 `cover`、`body` などのフィールドを UI で操作し、保存すると実際の Markdown ファイルがコミットされます。

## 2. サイト設定ファイル

`content/site.json`を別のファイルエディタで開くことで、ブログ名、説明、URLなどのメタ情報をCMSから修正できます。

## 画像のアップロード

アップロードパスは `static/uploads` です。 本文の画像は `/uploads/...` パスに保存され、ビルド後は GitHub Pages からも同じパスでアクセスできます。

## 運用方法

1. Pages CMSで記事を編集します。
2. 変更内容がリポジトリにコミットされます。
3. `main`ブランチにプッシュされると、GitHub Actionsが再ビルドを行います。
4. 最新の静的ビルド結果が GitHub Pages にデプロイされます。

要約すると、エディターの操作感はCMSのように保ちつつ、実際のソース・オブ・トゥルースは引き続きGitに残る構造となっています。
