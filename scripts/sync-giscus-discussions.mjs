import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const sourceDir = path.join(projectRoot, 'content/posts');
const githubApiUrl = 'https://api.github.com/graphql';

const loadEnvFile = (filePath) => {
	if (!existsSync(filePath)) {
		return;
	}

	for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) {
			continue;
		}

		const separatorIndex = trimmed.indexOf('=');
		if (separatorIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed
			.slice(separatorIndex + 1)
			.trim()
			.replace(/^"|"$/g, '')
			.replace(/^'|'$/g, '');

		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
};

loadEnvFile(path.join(projectRoot, '.env.production'));

const githubToken = process.env.GITHUB_TOKEN?.trim() ?? '';
const repoFullName =
	process.env.PUBLIC_GISCUS_REPO?.trim() || process.env.GITHUB_REPOSITORY?.trim() || '';
const repositoryId = process.env.PUBLIC_GISCUS_REPO_ID?.trim() ?? '';
const categoryId = process.env.PUBLIC_GISCUS_CATEGORY_ID?.trim() ?? '';
const siteUrl = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || 'https://example.com';

const normalizeLocale = (value, fallback = 'ko') => {
	const normalized = value?.trim().replaceAll('_', '-').toLowerCase() ?? '';

	return normalized === '' ? fallback : normalized;
};

const parseLocaleList = (value) => {
	const seen = new Set();

	return (value ?? '')
		.split(',')
		.map((locale) => normalizeLocale(locale, ''))
		.filter((locale) => {
			if (locale === '' || seen.has(locale)) {
				return false;
			}

			seen.add(locale);
			return true;
		});
};

const getLocaleBase = (locale) => normalizeLocale(locale, '').split('-')[0] ?? '';
const sourceLocale = normalizeLocale(process.env.PUBLIC_SOURCE_LOCALE, 'ko');
const translationLocales = parseLocaleList(
	process.env.PUBLIC_TRANSLATION_LOCALES || process.env.PUBLIC_TRANSLATION_LOCALE
).filter((locale) => locale !== sourceLocale);
const englishTranslationLocale = translationLocales.find(
	(locale) => getLocaleBase(locale) === 'en'
);

if (repoFullName === '' || repositoryId === '' || categoryId === '') {
	console.log('Giscus repository or category settings are missing. Skipping discussion sync.');
	process.exit(0);
}

if (githubToken === '') {
	throw new Error('GITHUB_TOKEN is required to sync giscus discussions.');
}

const [repoOwner, repoName] = repoFullName.split('/');

if (!repoOwner || !repoName) {
	throw new Error(`Invalid PUBLIC_GISCUS_REPO value: ${repoFullName}`);
}

const graphql = async (query, variables = {}) => {
	const response = await fetch(githubApiUrl, {
		method: 'POST',
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${githubToken}`,
			'Content-Type': 'application/json',
			'User-Agent': 'giscus-discussion-sync'
		},
		body: JSON.stringify({
			query,
			variables
		})
	});

	if (!response.ok) {
		throw new Error(`GitHub GraphQL request failed (${response.status}): ${await response.text()}`);
	}

	const payload = await response.json();

	if (payload.errors?.length > 0) {
		throw new Error(`GitHub GraphQL returned errors: ${JSON.stringify(payload.errors)}`);
	}

	return payload.data;
};

const listMarkdownFiles = async (dir) => {
	const entries = await readdir(dir, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => path.join(dir, entry.name))
		.sort((left, right) => left.localeCompare(right));
};

const isTruthy = (value) => value !== false;

const encodeSlugForUrl = (slug) =>
	slug
		.split('/')
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join('/');

const buildPostPath = (locale, slug) => {
	const encodedSlug = encodeSlugForUrl(slug);

	return normalizeLocale(locale) === sourceLocale
		? `/blog/${encodedSlug}/`
		: `/${normalizeLocale(locale)}/blog/${encodedSlug}/`;
};

const createGiscusTerm = (slug) =>
	`giscus-post-${createHash('sha256').update(slug).digest('hex').slice(0, 16)}`;

const readPostMetadata = async (filePath, slug, locale) => {
	const raw = await readFile(filePath, 'utf8');
	const { data } = matter(raw);
	const title = typeof data.title === 'string' && data.title.trim() !== '' ? data.title : slug;
	const description =
		typeof data.description === 'string' && data.description.trim() !== ''
			? data.description
			: title;

	return {
		description,
		locale,
		slug,
		title
	};
};

const readEnglishTranslation = async (slug) => {
	if (!englishTranslationLocale || getLocaleBase(sourceLocale) === 'en') {
		return null;
	}

	const translationFile = path.join(
		projectRoot,
		'content/translations',
		englishTranslationLocale,
		'posts',
		`${slug}.md`
	);

	try {
		return await readPostMetadata(translationFile, slug, englishTranslationLocale);
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return null;
		}

		throw error;
	}
};

const readDiscussionPosts = async () => {
	const files = await listMarkdownFiles(sourceDir);
	const posts = [];

	for (const filePath of files) {
		const raw = await readFile(filePath, 'utf8');
		const { data } = matter(raw);

		if (!isTruthy(data.published)) {
			continue;
		}

		const slug = path.basename(filePath, '.md');
		const sourcePost = await readPostMetadata(filePath, slug, sourceLocale);
		const englishPost = await readEnglishTranslation(slug);

		posts.push({
			...(englishPost ?? sourcePost),
			sourceLocale,
			sourceSlug: slug
		});
	}

	return posts;
};

const getTerm = (post) => createGiscusTerm(post.sourceSlug);
const getDiscussionTitle = (post) => `${post.title} [${getTerm(post)}]`;
const termPattern = /(giscus-post-[a-f0-9]{16}|post:\S+)/;

const extractTitleTerm = (discussion) => discussion.title.match(termPattern)?.[1] ?? null;
const extractBodyTerm = (discussion) =>
	discussion.bodyText?.match(/giscus term:\s*(\S+)/)?.[1] ?? null;

const fetchExistingDiscussionTerms = async () => {
	const linkedTerms = new Set();
	const bodyOnlyTerms = new Set();
	let cursor = null;

	do {
		const data = await graphql(
			`
				query ExistingGiscusDiscussions($owner: String!, $name: String!, $cursor: String) {
					repository(owner: $owner, name: $name) {
						discussions(
							first: 100
							after: $cursor
							orderBy: { field: CREATED_AT, direction: DESC }
						) {
							nodes {
								title
								bodyText
							}
							pageInfo {
								hasNextPage
								endCursor
							}
						}
					}
				}
			`,
			{
				cursor,
				name: repoName,
				owner: repoOwner
			}
		);

		const discussions = data.repository.discussions;
		for (const discussion of discussions.nodes) {
			const titleTerm = extractTitleTerm(discussion);

			if (titleTerm) {
				linkedTerms.add(titleTerm);
				continue;
			}

			const bodyTerm = extractBodyTerm(discussion);

			if (bodyTerm) {
				bodyOnlyTerms.add(bodyTerm);
			}
		}

		cursor = discussions.pageInfo.hasNextPage ? discussions.pageInfo.endCursor : null;
	} while (cursor);

	return { bodyOnlyTerms, linkedTerms };
};

const buildDiscussionBody = (post) => {
	const canonicalUrl = `${siteUrl}${buildPostPath(post.locale, post.sourceSlug)}`;
	const term = getTerm(post);

	return [
		post.description,
		'',
		'---',
		'',
		`Canonical URL: ${canonicalUrl}`,
		`Discussion locale: ${post.locale}`,
		'',
		`giscus term: ${term}`
	].join('\n');
};

const createDiscussion = async (post) => {
	await graphql(
		`
			mutation CreateGiscusDiscussion(
				$repositoryId: ID!
				$categoryId: ID!
				$title: String!
				$body: String!
			) {
				createDiscussion(
					input: {
						repositoryId: $repositoryId
						categoryId: $categoryId
						title: $title
						body: $body
					}
				) {
					discussion {
						id
					}
				}
			}
		`,
		{
			body: buildDiscussionBody(post),
			categoryId,
			repositoryId,
			title: getDiscussionTitle(post)
		}
	);
};

const posts = await readDiscussionPosts();
const { bodyOnlyTerms, linkedTerms } = await fetchExistingDiscussionTerms();
let createdCount = 0;
let skippedCount = 0;
let unlinkedCount = 0;

for (const post of posts) {
	const term = getTerm(post);

	if (linkedTerms.has(term)) {
		skippedCount += 1;
		continue;
	}

	if (bodyOnlyTerms.has(term)) {
		unlinkedCount += 1;
		console.warn(
			`Found unlinked body-only giscus discussion for ${term}; creating a replacement with the term in the title.`
		);
	}

	await createDiscussion(post);
	linkedTerms.add(term);
	createdCount += 1;
	console.log(`Created giscus discussion: ${term} (${post.locale})`);
}

console.log(
	`Giscus discussion sync complete. created=${createdCount} skipped=${skippedCount} unlinked=${unlinkedCount} total=${posts.length}`
);
