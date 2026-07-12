import { env as publicEnv } from '$env/dynamic/public';
import site from '../../content/site.json';
import { getLanguageTag, normalizeLocale, sourceLocale, type Locale } from '$lib/locales';

type SocialLink = {
	label: string;
	href: string;
};

type PublicEnvKey = `PUBLIC_${string}`;

const preferPublicEnv = (value: string | undefined, fallback: string) => {
	const trimmed = value?.trim() ?? '';
	return trimmed === '' ? fallback : trimmed;
};

const getPublicEnv = (key: PublicEnvKey) => publicEnv[key]?.trim() ?? '';

const preferPublicEnvKey = (key: PublicEnvKey, fallback: string) =>
	preferPublicEnv(publicEnv[key], fallback);

const preferPublicEnvKeys = (keys: PublicEnvKey[], fallback: string) => {
	for (const key of keys) {
		const value = getPublicEnv(key);

		if (value !== '') {
			return value;
		}
	}

	return fallback;
};

const createSocialLink = (
	labelKey: PublicEnvKey,
	urlKey: PublicEnvKey,
	fallbackLabel: string
): SocialLink | null => {
	const href = getPublicEnv(urlKey);

	if (href === '') {
		return null;
	}

	return {
		label: preferPublicEnvKey(labelKey, fallbackLabel),
		href
	};
};

const socialLinks = [
	createSocialLink('PUBLIC_SOCIAL_X_LABEL', 'PUBLIC_SOCIAL_X_URL', 'X'),
	createSocialLink('PUBLIC_SOCIAL_GITHUB_LABEL', 'PUBLIC_SOCIAL_GITHUB_URL', 'GitHub')
].filter((link): link is SocialLink => link !== null);

const siteWithPublicEnv = {
	...site,
	title: preferPublicEnvKey('PUBLIC_SITE_TITLE', site.title),
	tagline: preferPublicEnvKey('PUBLIC_SITE_TAGLINE', site.tagline),
	description: preferPublicEnvKey('PUBLIC_SITE_DESCRIPTION', site.description),
	author: preferPublicEnvKeys(['PUBLIC_SITE_AUTHOR', 'PUBLIC_SITE_OWNER'], site.author),
	footer: preferPublicEnvKey('PUBLIC_SITE_FOOTER', site.footer),
	url: preferPublicEnvKey('PUBLIC_SITE_URL', site.url),
	googleSiteVerification: getPublicEnv('PUBLIC_GOOGLE_SITE_VERIFICATION'),
	giscusRepo: preferPublicEnvKey('PUBLIC_GISCUS_REPO', site.giscusRepo),
	giscusRepoId: preferPublicEnvKey('PUBLIC_GISCUS_REPO_ID', site.giscusRepoId),
	giscusCategory: preferPublicEnvKey('PUBLIC_GISCUS_CATEGORY', site.giscusCategory),
	giscusCategoryId: preferPublicEnvKey('PUBLIC_GISCUS_CATEGORY_ID', site.giscusCategoryId)
};

const sourceSiteCopy = {
	description: siteWithPublicEnv.description,
	tagline: siteWithPublicEnv.tagline,
	footer: siteWithPublicEnv.footer
};

type LocalizedSiteCopy = typeof sourceSiteCopy;

const localizedSiteCopyFiles = import.meta.glob('/content/translations/*/site.json', {
	eager: true,
	import: 'default',
	query: '?raw'
}) as Record<string, string>;

const localizedSiteCopies = new Map<Locale, LocalizedSiteCopy>();

for (const [filePath, raw] of Object.entries(localizedSiteCopyFiles)) {
	const localeMatch = filePath.match(/\/content\/translations\/([^/]+)\/site\.json$/);
	if (!localeMatch) {
		continue;
	}

	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (
			typeof parsed.description !== 'string' ||
			typeof parsed.tagline !== 'string' ||
			typeof parsed.footer !== 'string'
		) {
			continue;
		}

		localizedSiteCopies.set(normalizeLocale(localeMatch[1], ''), {
			description: parsed.description,
			tagline: parsed.tagline,
			footer: parsed.footer
		});
	} catch {
		// Ignore incomplete generated files and use the source copy until the next translation sync.
	}
}

export type SiteConfig = typeof siteWithPublicEnv & {
	locale: Locale;
	socialLinks: SocialLink[];
};

export const getSiteConfig = (locale: Locale): SiteConfig => {
	const normalizedLocale = normalizeLocale(locale, sourceLocale);
	const translatedCopy = localizedSiteCopies.get(normalizedLocale);
	const localizedCopy = {
		description: preferPublicEnv(translatedCopy?.description, sourceSiteCopy.description),
		tagline: preferPublicEnv(translatedCopy?.tagline, sourceSiteCopy.tagline),
		footer: preferPublicEnv(translatedCopy?.footer, sourceSiteCopy.footer)
	};

	return {
		...siteWithPublicEnv,
		...localizedCopy,
		language: getLanguageTag(normalizedLocale),
		locale: normalizedLocale,
		socialLinks
	};
};
