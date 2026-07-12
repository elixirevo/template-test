---
title: Designing a Static Content Workflow with Pages CMS
description: >-
  Here’s a workflow that lets you use your Git repository as a CMS to manage
  both site settings and posts.
date: '2026-04-07'
published: true
category: Essays
locale: en
sourcePath: content/posts/2026-04-08-pages-cms-workflow.md
sourceHash: d76b4e4be8db4767d172bbdc1f2fee694a8104883cfaec1f95b2ae7ce2c42873
translationSchemaVersion: markdown-xml-v2
translationSource: deepl
translatedAt: '2026-04-10T02:16:29.921Z'
---
Pages CMS operates by **directly editing files in the GitHub repository** without using a separate database.

In this project, the root file ``.pages.yml`` connects the following two elements:

## 1. Post Collection

By registering the `content/posts` folder as a collection, you can create new posts and edit existing ones. Fields such as `title`, `description`, `date`, `cover`, `body`, and similar fields are handled in the UI; when saved, the actual Markdown files are committed.

## 2. Site Configuration File

By linking `content/site.json` to a separate text editor, you can edit meta information such as the blog name, description, and URL within the CMS.

## Image Upload

The upload path is `static/uploads`. Body images are saved to the path `/uploads/...`, and after building, they can be accessed via the same path on GitHub Pages.

## Operation

1. Edit posts in the Pages CMS.
2. Changes are committed to the repository.
3. When pushed to the `main` branch, GitHub Actions rebuilds the site.
4. The latest static output is deployed to GitHub Pages.

In summary, this structure maintains an editor experience similar to a CMS while keeping the actual source of truth in Git.
