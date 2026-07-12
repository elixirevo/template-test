<script lang="ts">
	import '../app.css';
	import { afterNavigate, goto } from '$app/navigation';
	import { base, resolve } from '$app/paths';
	import { page } from '$app/state';
	import SearchModal from '$lib/components/SearchModal.svelte';
	import {
		getLocaleFromPathname,
		getPreferredLocale,
		getUiCopy,
		isLocale,
		stripBasePath,
		toLocalePathname,
		withBasePath
	} from '$lib/i18n';
	import { getConfiguredLocales, getLocaleLabel, type Locale } from '$lib/locales';
	import { toHomePath, toRssPath } from '$lib/routes';
	import { getSiteConfig } from '$lib/site';
	import { onMount } from 'svelte';

	let { children } = $props();

	const currentYear = new Date().getFullYear();
	let isDarkMode = $state(false);
	let isSearchOpen = $state(false);
	let isLocaleMenuOpen = $state(false);
	let localeMenuEl = $state<HTMLDivElement | null>(null);

	const localeOptions = getConfiguredLocales();
	const routeLocale = $derived(getLocaleFromPathname(stripBasePath(page.url.pathname, base)));
	const site = $derived(getSiteConfig(routeLocale));
	const ui = $derived(getUiCopy(routeLocale));
	const homePath = $derived(toHomePath(routeLocale));
	const currentLocaleLabel = $derived(getLocaleLabel(routeLocale));
	const hasLocaleSwitcher = $derived(localeOptions.length > 1);
	const shouldShowLocaleMenu = $derived(localeOptions.length > 2);
	const pairedLocale = $derived(
		localeOptions.length === 2
			? (localeOptions.find((localeOption) => localeOption !== routeLocale) ?? null)
			: null
	);
	const currentRssPath = $derived(toRssPath(routeLocale));
	const rssLinks = $derived(
		localeOptions.map((localeOption) => {
			const localeSite = getSiteConfig(localeOption);

			return {
				href: resolve(toRssPath(localeOption) as '/rss.xml'),
				locale: localeOption,
				title:
					localeOptions.length > 1
						? `${localeSite.title} (${getLocaleLabel(localeOption)})`
						: localeSite.title
			};
		})
	);

	const syncThemeFromStorage = () => {
		const prefersDark =
			localStorage.theme === 'dark' ||
			(!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);

		document.documentElement.classList.toggle('dark', prefersDark);
		isDarkMode = prefersDark;
	};

	afterNavigate(() => {
		isSearchOpen = false;
		isLocaleMenuOpen = false;
		if (typeof document !== 'undefined') {
			document.documentElement.lang = site.language;
		}
	});

	onMount(() => {
		document.documentElement.lang = site.language;
		syncThemeFromStorage();

		const handleDocumentPointerDown = (event: PointerEvent) => {
			if (
				!isLocaleMenuOpen ||
				!localeMenuEl ||
				!(event.target instanceof Node) ||
				localeMenuEl.contains(event.target)
			) {
				return;
			}

			isLocaleMenuOpen = false;
		};

		const handleDocumentKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				isLocaleMenuOpen = false;
			}
		};

		document.addEventListener('pointerdown', handleDocumentPointerDown);
		document.addEventListener('keydown', handleDocumentKeydown);

		const pathname = stripBasePath(window.location.pathname, base);
		const shouldRedirectFromRoot = pathname === '/' || pathname === '';

		if (shouldRedirectFromRoot) {
			const storedLocale = localStorage.getItem('preferredLocale');
			const preferredLocale =
				storedLocale && isLocale(storedLocale)
					? storedLocale
					: getPreferredLocale(window.navigator.languages);

			if (preferredLocale !== routeLocale) {
				const nextPath = withBasePath(toLocalePathname(pathname, preferredLocale), base);
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				void goto(`${nextPath}${window.location.search}${window.location.hash}`, {
					replaceState: true,
					noScroll: true,
					keepFocus: true
				});
			}
		}

		return () => {
			document.removeEventListener('pointerdown', handleDocumentPointerDown);
			document.removeEventListener('keydown', handleDocumentKeydown);
		};
	});

	const toggleTheme = () => {
		isDarkMode = !isDarkMode;
		if (isDarkMode) {
			document.documentElement.classList.add('dark');
			localStorage.theme = 'dark';
		} else {
			document.documentElement.classList.remove('dark');
			localStorage.theme = 'light';
		}
	};

	const persistLocale = (locale: Locale) => {
		localStorage.setItem('preferredLocale', locale);
	};

	const switchLocale = (locale: Locale) => {
		if (!isLocale(locale)) {
			return;
		}

		isLocaleMenuOpen = false;
		persistLocale(locale);
		const nextPath = withBasePath(
			toLocalePathname(stripBasePath(page.url.pathname, base), locale),
			base
		);
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(nextPath, {
			replaceState: false,
			noScroll: true,
			keepFocus: true
		});
	};
</script>

<svelte:head>
	<meta name="theme-color" content="#f9f9f9" />
	{#if site.googleSiteVerification}
		<meta name="google-site-verification" content={site.googleSiteVerification} />
	{/if}
	{#each rssLinks as rssLink (rssLink.locale)}
		<link rel="alternate" type="application/rss+xml" title={rssLink.title} href={rssLink.href} />
	{/each}
</svelte:head>

<div class="app-shell">
	<div class="bg-decorator"></div>

	<nav class="navbar">
		<div class="container">
			<a class="nav-brand" href={resolve(homePath as '/')}>
				{site.title}
			</a>
			<div class="nav-actions">
				<button
					class="search-box"
					onclick={() => (isSearchOpen = true)}
					aria-label={ui.nav.searchAriaLabel}
				>
					<span class="material-symbols-outlined" data-icon="search">search</span>
					<span class="ui-font">{ui.nav.searchButton}</span>
				</button>
				{#if hasLocaleSwitcher}
					<div class="locale-switcher" bind:this={localeMenuEl}>
						{#if shouldShowLocaleMenu}
							<button
								type="button"
								class="locale-trigger ui-font"
								aria-label={ui.nav.localeSwitch}
								aria-haspopup="listbox"
								aria-expanded={isLocaleMenuOpen}
								onclick={() => {
									isLocaleMenuOpen = !isLocaleMenuOpen;
								}}
							>
								<span class="locale-current">{currentLocaleLabel}</span>
								<span class="material-symbols-outlined locale-chevron" data-icon="expand_more">
									expand_more
								</span>
							</button>

							{#if isLocaleMenuOpen}
								<div class="locale-menu" role="listbox" aria-label={ui.nav.localeSwitch}>
									{#each localeOptions as localeOption (localeOption)}
										<button
											type="button"
											class="locale-option ui-font"
											role="option"
											aria-selected={localeOption === routeLocale}
											data-active={localeOption === routeLocale ? 'true' : 'false'}
											onclick={() => switchLocale(localeOption)}
										>
											<span>{getLocaleLabel(localeOption)}</span>
										</button>
									{/each}
								</div>
							{/if}
						{:else if pairedLocale}
							<button
								type="button"
								class="locale-trigger locale-trigger-single ui-font"
								aria-label={ui.nav.localeSwitch}
								onclick={() => switchLocale(pairedLocale)}
							>
								<span class="locale-current">{getLocaleLabel(pairedLocale)}</span>
							</button>
						{/if}
					</div>
				{/if}
				<button onclick={toggleTheme} aria-label="Toggle theme" class="theme-toggle">
					<span
						class="material-symbols-outlined"
						data-icon={isDarkMode ? 'light_mode' : 'dark_mode'}
						>{isDarkMode ? 'light_mode' : 'dark_mode'}</span
					>
				</button>
			</div>
		</div>
	</nav>

	<main class="main-content">
		{@render children()}
	</main>

	<footer class="footer">
		<div class="container">
			<span class="footer-copy font-label">
				© {currentYear}
				{site.title}. {site.footer}
			</span>
			<div class="footer-links font-label">
				<a href={resolve(currentRssPath as '/rss.xml')}>{ui.footer.rss}</a>
				{#each site.socialLinks as socialLink (socialLink.href)}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={socialLink.href} target="_blank" rel="noreferrer">{socialLink.label}</a>
				{/each}
			</div>
		</div>
	</footer>
</div>

<SearchModal
	isOpen={isSearchOpen}
	locale={routeLocale}
	{ui}
	onClose={() => {
		isSearchOpen = false;
	}}
/>
