import color from 'chalk';
import nodeFetch from 'node-fetch';
import {
	http,
	azure,
	bitbucket,
	fetchManifest,
	fetchRaw,
	github,
	gitlab,
	providers,
	selectProvider
} from '.';
import type { Block, Manifest } from '../../types';
import { Err, Ok, type Result } from '../blocks/ts/result';
import * as u from '../blocks/ts/url';
import * as persisted from '../persisted';
import type { RegistryProvider, RegistryProviderState } from './types';

export type RemoteBlock = Block & { sourceRepo: RegistryProviderState };

/** Wraps the basic implementation to inject `node-fetch` and the correct token. */
export const internalFetchRaw = async (
	state: RegistryProviderState,
	resourcePath: string,
	{ verbose }: { verbose?: (msg: string) => void } = {}
) => {
	return await fetchRaw(state, resourcePath, {
		verbose,
		// @ts-expect-error but it does work
		fetch: nodeFetch,
		token: getProviderToken(state.provider, state.url)
	});
};

/** Wraps the basic implementation to inject `node-fetch` and the correct token. */
export const internalFetchManifest = async (
	state: RegistryProviderState,
	{ verbose }: { verbose?: (msg: string) => void } = {}
) => {
	return await fetchManifest(state, {
		verbose,
		// @ts-expect-error but it does work
		fetch: nodeFetch,
		token: getProviderToken(state.provider, state.url)
	});
};

/** Gets the locally stored token for the given provider */
export const getProviderToken = (provider: RegistryProvider, url: string): string | undefined => {
	const key = provider.name === http.name ? http.keys.token(url) : provider.name;

	const token = persisted.get().get(`${key}-token`);

	if (!token) return;

	return token as string;
};

/** Parses the provided url and returns the state.
 *
 * @param repo
 * @returns
 */
export const getProviderState = async (
	repo: string,
	{ noCache = false }: { noCache?: boolean } = {}
): Promise<Result<RegistryProviderState, string>> => {
	const provider = selectProvider(repo);

	if (provider) {
		const storage = persisted.get();

		// only git providers are cached
		if (provider.name !== http.name && !noCache) {
			const cached = storage.get(`${repo}-state`);

			if (cached) return Ok({ ...(cached as RegistryProviderState), provider });
		}

		const state = await provider.state(repo, {
			token: getProviderToken(provider, repo),
			// @ts-expect-error but it does work
			fetch: nodeFetch
		});

		// only cache git providers
		if (provider.name !== http.name && !noCache) {
			storage.set(`${repo}-state`, state);
		}

		return Ok(state);
	}

	return Err(
		`Only ${providers.map((p, i) => `${i === providers.length - 1 ? 'and ' : ''}${color.bold(p.name)}`).join(', ')} registries are supported at this time!`
	);
};

/** Gets the provider state for each provided repo url
 *
 * @param repos
 * @returns
 */
export const forEachPathGetProviderState = async (
	repos: string[],
	{ noCache = false }: { noCache?: boolean } = {}
): Promise<Result<RegistryProviderState[], { message: string; repo: string }>> => {
	const resolvedPaths: RegistryProviderState[] = [];

	const errors = await Promise.all(
		repos.map(async (repo) => {
			const getProviderResult = await getProviderState(repo, { noCache });

			if (getProviderResult.isErr()) return Err({ message: getProviderResult.unwrapErr(), repo });

			const providerState = getProviderResult.unwrap();

			resolvedPaths.push(providerState);
		})
	);

	const err = errors.find((err) => err !== undefined);

	if (err) return err;

	return Ok(resolvedPaths);
};

/** Fetches blocks for each registry and stores them in a map by their repo as well as category and block name.
 *
 * Example Key:
 * `github/ieedan/std/utils/math`
 *
 * @param repos
 * @returns
 */
export const fetchBlocks = async (
	...repos: RegistryProviderState[]
): Promise<Result<Map<string, RemoteBlock>, { message: string; repo: string }>> => {
	const blocksMap = new Map<string, RemoteBlock>();

	const errors = await Promise.all(
		repos.map(async (state) => {
			const getManifestResult = await internalFetchManifest(state);

			if (getManifestResult.isErr()) {
				return Err({ message: getManifestResult.unwrapErr(), repo: state.url });
			}

			const manifest = getManifestResult.unwrap();

			for (const category of manifest.categories) {
				for (const block of category.blocks) {
					blocksMap.set(u.join(state.url, `${block.category}/${block.name}`), {
						...block,
						sourceRepo: state
					});
				}
			}
		})
	);

	const err = errors.find((err) => err !== undefined);

	if (err) return err;

	return Ok(blocksMap);
};

/** Maps the result of fetchManifests into a map of remote blocks
 *
 * @param manifests
 */
export const getRemoteBlocks = (manifests: FetchManifestResult[]) => {
	const blocksMap = new Map<string, RemoteBlock>();

	for (const manifest of manifests) {
		for (const category of manifest.manifest.categories) {
			for (const block of category.blocks) {
				blocksMap.set(u.join(manifest.state.url, `${block.category}/${block.name}`), {
					...block,
					sourceRepo: manifest.state
				});
			}
		}
	}

	return blocksMap;
};

export type FetchManifestResult = {
	state: RegistryProviderState;
	manifest: Manifest;
};

/** Fetches the manifests for each provider
 *
 * @param repos
 * @returns
 */
export const fetchManifests = async (
	...repos: RegistryProviderState[]
): Promise<Result<FetchManifestResult[], { message: string; repo: string }>> => {
	const manifests: FetchManifestResult[] = [];

	const errors = await Promise.all(
		repos.map(async (state) => {
			const getManifestResult = await internalFetchManifest(state);

			if (getManifestResult.isErr()) {
				return Err({ message: getManifestResult.unwrapErr(), repo: state.url });
			}

			const manifest = getManifestResult.unwrap();

			manifests.push({ state, manifest });
		})
	);

	const err = errors.find((err) => err !== undefined);

	if (err) return err;

	return Ok(manifests);
};

export * from './types';

export {
	azure,
	bitbucket,
	github,
	gitlab,
	http,
	providers,
	internalFetchManifest as fetchManifest,
	internalFetchRaw as fetchRaw,
	selectProvider
};
