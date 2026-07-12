import { env as publicEnv } from '$env/dynamic/public';
import site from '../content/site.json';
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

const toEnvLocaleSuffix = (locale: Locale) =>
	normalizeLocale(locale, '').replaceAll('-', '_').toUpperCase();

const getLocalizedPublicEnv = (key: PublicEnvKey, locale: Locale) => {
	const normalizedLocale = normalizeLocale(locale, sourceLocale);
	const baseLocale = normalizedLocale.split('-')[0] ?? normalizedLocale;
	const localizedKeys = [
		`${key}_${toEnvLocaleSuffix(normalizedLocale)}`,
		`${key}_${toEnvLocaleSuffix(baseLocale)}`
	] as PublicEnvKey[];

	for (const localizedKey of localizedKeys) {
		const value = getPublicEnv(localizedKey);

		if (value !== '') {
			return value;
		}
	}

	return getPublicEnv(key);
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

export type SiteConfig = typeof siteWithPublicEnv & {
	locale: Locale;
	socialLinks: SocialLink[];
};

export const getSiteConfig = (locale: Locale): SiteConfig => {
	const normalizedLocale = normalizeLocale(locale, sourceLocale);
	const localizedCopy = {
		description: preferPublicEnv(
			getLocalizedPublicEnv('PUBLIC_SITE_DESCRIPTION', normalizedLocale),
			sourceSiteCopy.description
		),
		tagline: preferPublicEnv(
			getLocalizedPublicEnv('PUBLIC_SITE_TAGLINE', normalizedLocale),
			sourceSiteCopy.tagline
		),
		footer: preferPublicEnv(
			getLocalizedPublicEnv('PUBLIC_SITE_FOOTER', normalizedLocale),
			sourceSiteCopy.footer
		)
	};

	return {
		...siteWithPublicEnv,
		...localizedCopy,
		language: getLanguageTag(normalizedLocale),
		locale: normalizedLocale,
		socialLinks
	};
};
