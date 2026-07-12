import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.GISCUS_SYNC_ROOT
	? path.resolve(process.env.GISCUS_SYNC_ROOT)
	: path.resolve(scriptDir, '..');
const sourceDir = path.join(projectRoot, 'content/posts');
const githubApiUrl = process.env.GITHUB_GRAPHQL_URL?.trim() || 'https://api.github.com/graphql';

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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const isPostId = (value) =>
	typeof value === 'string' && (uuidPattern.test(value.trim()) || ulidPattern.test(value.trim()));

const readPostMetadata = async (filePath, slug, locale) => {
	const raw = await readFile(filePath, 'utf8');
	const { data } = matter(raw);
	const id = typeof data.id === 'string' ? data.id.trim() : '';

	if (!isPostId(id)) {
		throw new Error(
			`Missing or invalid immutable post id in ${path.relative(projectRoot, filePath)}`
		);
	}

	const title = typeof data.title === 'string' && data.title.trim() !== '' ? data.title : slug;
	const description =
		typeof data.description === 'string' && data.description.trim() !== ''
			? data.description
			: title;

	return {
		description,
		id,
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

		if (englishPost && englishPost.id !== sourcePost.id) {
			throw new Error(
				`Translated post ${slug} changed immutable source post id ${sourcePost.id} to ${englishPost.id}`
			);
		}

		posts.push({
			...(englishPost ?? sourcePost),
			sourceLocale,
			sourceSlug: slug
		});
	}

	return posts;
};

const getTerm = (post) => createGiscusTerm(post.id);
const getLegacyTerms = (post) => [createGiscusTerm(post.sourceSlug), `post:${post.sourceSlug}`];
const getDiscussionTitle = (post) => `${post.title} [${getTerm(post)}]`;
const termPattern = /giscus-post-[a-f0-9]{16}/;

const extractTitleTerm = (discussion) => {
	const title = discussion.title.trim();
	return title.startsWith('post:') ? title : (title.match(termPattern)?.[0] ?? null);
};

const extractBodyTerm = (discussion) => {
	const termLine = discussion.bodyText
		?.split(/\r?\n/)
		.find((line) => line.trim().startsWith('giscus term:'));

	return termLine?.replace(/^.*?giscus term:\s*/, '').trim() || null;
};

const fetchExistingDiscussionTerms = async () => {
	const linkedTerms = new Map();
	const bodyOnlyTerms = new Map();
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
								id
								title
								body
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
				const duplicate = linkedTerms.get(titleTerm);
				if (duplicate && duplicate.id !== discussion.id) {
					throw new Error(`Multiple giscus discussions use title term ${titleTerm}`);
				}

				linkedTerms.set(titleTerm, discussion);
				continue;
			}

			const bodyTerm = extractBodyTerm(discussion);

			if (bodyTerm) {
				const duplicate = bodyOnlyTerms.get(bodyTerm);
				if (duplicate && duplicate.id !== discussion.id) {
					throw new Error(`Multiple giscus discussions use body term ${bodyTerm}`);
				}

				bodyOnlyTerms.set(bodyTerm, discussion);
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

const migrateDiscussionTerm = async (post, discussion, previousTerm) => {
	const term = getTerm(post);
	const title = extractTitleTerm(discussion)
		? discussion.title.replaceAll(previousTerm, term)
		: getDiscussionTitle(post);
	const migratedBody =
		typeof discussion.body === 'string' && discussion.body !== ''
			? discussion.body.replaceAll(previousTerm, term)
			: buildDiscussionBody(post);
	const body = migratedBody.includes(term)
		? migratedBody
		: `${migratedBody.trimEnd()}\n\ngiscus term: ${term}`;

	await graphql(
		`
			mutation MigrateGiscusDiscussionTerm($discussionId: ID!, $title: String!, $body: String!) {
				updateDiscussion(input: { discussionId: $discussionId, title: $title, body: $body }) {
					discussion {
						id
					}
				}
			}
		`,
		{
			body,
			discussionId: discussion.id,
			title
		}
	);
};

const posts = await readDiscussionPosts();
const { bodyOnlyTerms, linkedTerms } = await fetchExistingDiscussionTerms();
let createdCount = 0;
let migratedCount = 0;
let skippedCount = 0;
let unlinkedCount = 0;

for (const post of posts) {
	const term = getTerm(post);
	const legacyTerms = getLegacyTerms(post);
	const currentDiscussion = linkedTerms.get(term);
	const currentBodyOnlyDiscussion = bodyOnlyTerms.get(term);
	const legacyDiscussionEntry = legacyTerms
		.map((legacyTerm) => [legacyTerm, linkedTerms.get(legacyTerm)])
		.find(([, discussion]) => discussion);
	const legacyBodyOnlyEntry = legacyTerms
		.map((legacyTerm) => [legacyTerm, bodyOnlyTerms.get(legacyTerm)])
		.find(([, discussion]) => discussion);
	const legacyDiscussion = legacyDiscussionEntry?.[1];
	const legacyBodyOnlyDiscussion = legacyBodyOnlyEntry?.[1];
	const discussionIds = new Set(
		[currentDiscussion, legacyDiscussion, currentBodyOnlyDiscussion, legacyBodyOnlyDiscussion]
			.filter(Boolean)
			.map((discussion) => discussion.id)
	);

	if (discussionIds.size > 1) {
		throw new Error(
			`Multiple current or legacy giscus discussions exist for ${post.sourceSlug}; merge them before continuing`
		);
	}

	if (currentDiscussion) {
		skippedCount += 1;
		continue;
	}

	if (legacyDiscussion) {
		const legacyTerm = legacyDiscussionEntry[0];
		await migrateDiscussionTerm(post, legacyDiscussion, legacyTerm);
		linkedTerms.delete(legacyTerm);
		linkedTerms.set(term, legacyDiscussion);
		migratedCount += 1;
		console.log(`Migrated giscus discussion: ${legacyTerm} -> ${term} (${post.locale})`);
		continue;
	}

	const bodyOnlyTerm = currentBodyOnlyDiscussion ? term : legacyBodyOnlyEntry?.[0];
	const bodyOnlyDiscussion = currentBodyOnlyDiscussion ?? legacyBodyOnlyDiscussion;

	if (bodyOnlyDiscussion && bodyOnlyTerm) {
		unlinkedCount += 1;
		await migrateDiscussionTerm(post, bodyOnlyDiscussion, bodyOnlyTerm);
		bodyOnlyTerms.delete(bodyOnlyTerm);
		linkedTerms.set(term, bodyOnlyDiscussion);
		migratedCount += 1;
		console.log(`Linked existing giscus discussion: ${bodyOnlyTerm} -> ${term} (${post.locale})`);
		continue;
	}

	await createDiscussion(post);
	linkedTerms.set(term, { id: term });
	createdCount += 1;
	console.log(`Created giscus discussion: ${term} (${post.locale})`);
}

console.log(
	`Giscus discussion sync complete. created=${createdCount} migrated=${migratedCount} skipped=${skippedCount} unlinked=${unlinkedCount} total=${posts.length}`
);
