import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import hljs from 'highlight.js';
import { marked, type Tokens } from 'marked';
import {
	getConfiguredLocales,
	isTranslationLocale,
	normalizeLocale,
	sourceLocale,
	type Locale
} from '$lib/locales';
import { getSiteConfig } from '$lib/site';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const normalizeLanguage = (lang: string | undefined) => {
	const language = lang?.match(/\S+/)?.[0]?.toLowerCase();

	if (!language) {
		return null;
	}

	return hljs.getLanguage(language) ? language : null;
};

const renderCodeBlock = ({ text, lang }: Tokens.Code) => {
	const language = normalizeLanguage(lang);
	const highlighted = language
		? hljs.highlight(text, { language, ignoreIllegals: true }).value
		: escapeHtml(text);
	const languageClass = language ? ` language-${language}` : ' language-plaintext';
	const languageLabel = language ? language.toUpperCase() : 'TEXT';

	return `<div class="code-block"><span class="code-language">${languageLabel}</span><pre><code class="hljs${languageClass}">${highlighted}</code></pre></div>`;
};

marked.use({
	gfm: true,
	breaks: false,
	renderer: {
		code(token) {
			return renderCodeBlock(token);
		}
	}
});

const sourcePostFiles = import.meta.glob('/content/posts/*.md', {
	eager: true,
	import: 'default',
	query: '?raw'
}) as Record<string, string>;

const translatedPostFiles = import.meta.glob('/content/translations/*/posts/*.md', {
	eager: true,
	import: 'default',
	query: '?raw'
}) as Record<string, string>;

type Frontmatter = {
	title?: string;
	description?: string;
	date?: string | Date;
	published?: boolean;
	category?: string;
	tags?: string[] | string;
	cover?: string;
};

type ParsedPost = {
	locale: Locale;
	slug: string;
	title: string;
	description: string;
	date: string;
	published: boolean;
	formattedDate: string;
	readingTime: string;
	category: string;
	tags: string[];
	cover: string | null;
	excerpt: string;
	giscusTerm: string;
	html: string;
	timestamp: number;
};

export type BlogPost = Omit<ParsedPost, 'published' | 'timestamp'>;
export type PostSummary = Omit<ParsedPost, 'giscusTerm' | 'html' | 'published' | 'timestamp'>;

const toSlug = (path: string) => path.split('/').at(-1)?.replace(/\.md$/, '') ?? path;

const createGiscusTerm = (slug: string) =>
	`giscus-post-${createHash('sha256').update(slug).digest('hex').slice(0, 16)}`;

const getTranslationLocaleFromPath = (path: string): Locale | null => {
	const match = path.match(/\/content\/translations\/([^/]+)\/posts\//);

	if (!match) {
		return null;
	}

	const locale = normalizeLocale(match[1]);

	return isTranslationLocale(locale) ? locale : null;
};

const normalizeCover = (cover: unknown) => {
	if (typeof cover !== 'string' || cover.trim() === '') {
		return null;
	}

	return cover.startsWith('/') ? cover : `/${cover.replace(/^\/+/, '')}`;
};

const parseTagString = (value: string) => {
	const trimmed = value.trim();

	if (trimmed === '') {
		return [];
	}

	if (trimmed.includes('#')) {
		return trimmed.split(/[\s,]+/).filter(Boolean);
	}

	return trimmed.split(',');
};

const normalizeTag = (value: unknown) => {
	if (typeof value !== 'string') {
		return null;
	}

	const tag = value.trim().replace(/^#+/, '').trim();

	return tag === '' ? null : tag;
};

const normalizeTags = (tags: unknown) => {
	const values = Array.isArray(tags)
		? tags.flatMap((tag) => (typeof tag === 'string' ? parseTagString(tag) : [tag]))
		: typeof tags === 'string'
			? parseTagString(tags)
			: [];
	const seen = new Set<string>();

	return values.map(normalizeTag).filter((tag): tag is string => {
		if (!tag || seen.has(tag.toLowerCase())) {
			return false;
		}

		seen.add(tag.toLowerCase());
		return true;
	});
};

const stripMarkdown = (content: string) =>
	content
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/^>\s?/gm, '')
		.replace(/^#+\s+/gm, '')
		.replace(/[*_~]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

const estimateReadingTime = (content: string) => {
	const wordCount = stripMarkdown(content).split(/\s+/).filter(Boolean).length;
	return `${Math.max(1, Math.ceil(wordCount / 220))} min read`;
};

const createExcerpt = (description: string, content: string) => {
	if (description.trim() !== '') {
		return description;
	}

	return `${stripMarkdown(content).slice(0, 160)}...`;
};

const formatDate = (locale: Locale, timestamp: number) =>
	new Intl.DateTimeFormat(getSiteConfig(locale).language, {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	}).format(new Date(timestamp));

const parsePost = (path: string, source: string, locale: Locale): ParsedPost => {
	const slug = toSlug(path);
	const { content, data } = matter(source);
	const frontmatter = data as Frontmatter;

	if (!frontmatter.title || !frontmatter.description || !frontmatter.date) {
		throw new Error(`Missing required frontmatter in ${path}`);
	}

	const date =
		frontmatter.date instanceof Date ? frontmatter.date.toISOString() : String(frontmatter.date);
	const timestamp = Date.parse(date);

	if (Number.isNaN(timestamp)) {
		throw new Error(`Invalid date in ${path}: ${date}`);
	}

	return {
		locale,
		slug,
		title: frontmatter.title,
		description: frontmatter.description,
		date,
		published: frontmatter.published !== false,
		formattedDate: formatDate(locale, timestamp),
		readingTime: estimateReadingTime(content),
		category: frontmatter.category?.trim() || 'Notes',
		tags: normalizeTags(frontmatter.tags),
		cover: normalizeCover(frontmatter.cover),
		excerpt: createExcerpt(frontmatter.description, content),
		giscusTerm: createGiscusTerm(slug),
		html: marked.parse(content) as string,
		timestamp
	};
};

const comparePostsByPublishTime = (left: ParsedPost, right: ParsedPost) =>
	right.timestamp - left.timestamp ||
	right.date.localeCompare(left.date) ||
	right.slug.localeCompare(left.slug);

const postsByLocale = new Map<Locale, ParsedPost[]>();

postsByLocale.set(
	sourceLocale,
	Object.entries(sourcePostFiles)
		.map(([path, source]) => parsePost(path, source, sourceLocale))
		.filter(({ published }) => published)
		.sort(comparePostsByPublishTime)
);

for (const [path, source] of Object.entries(translatedPostFiles)) {
	const locale = getTranslationLocaleFromPath(path);

	if (!locale) {
		continue;
	}

	const posts = postsByLocale.get(locale) ?? [];
	posts.push(parsePost(path, source, locale));
	postsByLocale.set(locale, posts);
}

for (const [locale, posts] of postsByLocale) {
	postsByLocale.set(
		locale,
		posts.filter(({ published }) => published).sort(comparePostsByPublishTime)
	);
}

const toSummary = (post: ParsedPost): PostSummary => ({
	locale: post.locale,
	slug: post.slug,
	title: post.title,
	description: post.description,
	date: post.date,
	formattedDate: post.formattedDate,
	readingTime: post.readingTime,
	category: post.category,
	tags: post.tags,
	cover: post.cover,
	excerpt: post.excerpt
});

const toBlogPost = (post: ParsedPost): BlogPost => ({
	...toSummary(post),
	giscusTerm: post.giscusTerm,
	html: post.html
});

export const getAllPosts = (locale: Locale = sourceLocale): PostSummary[] =>
	(postsByLocale.get(locale) ?? []).map(toSummary);

export const getPost = (slug: string, locale: Locale = sourceLocale): BlogPost | undefined => {
	const post = postsByLocale.get(locale)?.find((entry) => entry.slug === slug);

	if (!post) {
		return undefined;
	}

	return toBlogPost(post);
};

export const getPostLocales = (slug: string): Locale[] =>
	getConfiguredLocales().filter((locale) =>
		postsByLocale.get(locale)?.some((post) => post.slug === slug)
	);
