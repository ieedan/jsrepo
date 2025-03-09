import {
	fetchManifest,
	github,
	gitlab,
	http,
	type Manifest,
	type RegistryProvider,
	type RegistryProviderState
} from 'jsrepo';
import { markdownIt } from '../markdown';
import DOMPurify from 'isomorphic-dompurify';
import { GITHUB_TOKEN, GITLAB_TOKEN } from '$env/static/private';
import { redis } from '../redis-client';

const REGISTRY_STATE_CACHE_PREFIX = 'registry:state';

export type RegistryPageData = {
	registryUrl: string;
	manifest: Manifest;
	readme: string | undefined;
};

export type RegistryInfo = Omit<RegistryPageData, 'registryUrl'>;

/** Gets the provider state either locally or from the cache then caches the state
 *
 * @param registryUrl
 * @param provider
 * @param param2
 * @returns
 */
export const getProviderState = async (
	registryUrl: string,
	provider: RegistryProvider,
	{ cache = true }: { cache?: boolean } = {}
): Promise<RegistryProviderState> => {
	const stateKey = `${REGISTRY_STATE_CACHE_PREFIX}:${registryUrl}`;

	let state: RegistryProviderState | undefined = undefined;

	// http never needs time to get the state
	if (cache && provider.name !== 'http') {
		const getCached = async (): Promise<RegistryProviderState | undefined> => {
			const s = await redis.get(stateKey);

			if (!s) return undefined;

			// s has everything except for the provider
			return {
				...s,
				provider
			} as RegistryProviderState;
		};

		const getLocal = async () =>
			await provider.state(registryUrl, { token: getProviderToken(provider, registryUrl) });

		const resolvedLocal = getLocal();

		// whichever is faster we use they should say the same thing
		const result = await Promise.race([resolvedLocal, getCached()]);

		// if the cache comes back empty just wait the rest of the time for resolvedLocal to resolve
		if (result === undefined) {
			state = await resolvedLocal;
		} else {
			state = result;
		}
	} else {
		state = await provider.state(registryUrl, { token: getProviderToken(provider, registryUrl) });
	}

	// never cache http
	if (provider.name !== 'http') {
		await redis.set(stateKey, state);
	}

	return state;
};

export const getRegistryData = async (
	providerState: RegistryProviderState
): Promise<RegistryInfo | undefined> => {
	const [manifestResult, readmeResult] = await Promise.all([
		fetchManifest(providerState, {
			token: getProviderToken(providerState.provider, providerState.url)
		}),
		fetchReadme(providerState)
	]);

	if (manifestResult.isErr()) return undefined;

	const manifest = manifestResult.unwrap();

	let readme: string | undefined = readmeResult;

	if (readme != undefined) {
		const md = await markdownIt();

		readme = DOMPurify.sanitize(md.render(readme));
	}

	return {
		manifest,
		readme
	};
};

/** Gets the readme for the registry (if it exists) */
export const fetchReadme = async (state: RegistryProviderState): Promise<string | undefined> => {
	const url = await state.provider.resolveRaw(state, 'README.md');

	try {
		const headers = new Headers();

		const token = getProviderToken(state.provider, state.url);

		if (token !== undefined && state.provider.authHeader) {
			const [key, value] = state.provider.authHeader(token);

			headers.append(key, value);
		}

		const response = await fetch(url, { headers });

		if (!response.ok) {
			return undefined;
		}

		// this is because instead of returning 404 in some cases a webpage will be returned
		if (response.headers.get('Content-Type')?.startsWith('text/html')) {
			return undefined;
		}

		return await response.text();
	} catch {
		return undefined;
	}
};

export const getProviderToken = (provider: RegistryProvider, url: string): string | undefined => {
	switch (provider.name) {
		case github.name:
			return GITHUB_TOKEN;
		case gitlab.name:
			return GITLAB_TOKEN;
		case http.name:
			return http.keys.token(url);
		// add the rest of the tokens here
	}

	return undefined;
};
