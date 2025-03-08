import color from 'chalk';
import { startsWithOneOf } from '../blocks/ts/strings';
import type { ParseOptions, RegistryProvider, RegistryProviderState } from './types';

const DEFAULT_BRANCH = 'master';

export interface BitBucketProviderState extends RegistryProviderState {
	owner: string;
	repoName: string;
	ref: string;
}

/** Valid paths
 *
 * `bitbucket/ieedan/std`
 *
 * `https://bitbucket.org/ieedan/std/src/main/`
 *
 * `https://bitbucket.org/ieedan/std/src/next/`
 *
 * `https://bitbucket.org/ieedan/std/src/v2.0.0/`
 *
 */
export const bitbucket: RegistryProvider = {
	name: 'bitbucket',

	matches: (url) => startsWithOneOf(url.toLowerCase(), ['bitbucket', 'https://bitbucket.org']),

	parse: (url, opts) => {
		const parsed = parseUrl(url, opts);

		return {
			url: parsed.url,
			specifier: parsed.specifier,
		};
	},

	baseUrl: (url) => {
		const { owner, repoName } = parseUrl(url, { fullyQualified: false });

		return `https://bitbucket.org/${owner}/${repoName}`;
	},

	state: async (url, { token, fetch: f = fetch } = {}) => {
		let { url: normalizedUrl, owner, repoName, ref } = parseUrl(url, { fullyQualified: false });

		// fetch default branch if ref was not provided
		if (ref === undefined) {
			try {
				const headers = new Headers();

				if (token !== undefined) {
					const [key, value] = bitbucket.authHeader!(token);

					headers.append(key, value);
				}

				const response = await f(
					`https://api.bitbucket.org/2.0/repositories/${owner}/${repoName}`,
					{
						headers,
					}
				);

				if (response.ok) {
					const data = await response.json();

					// @ts-ignore yes but we know
					ref = data.mainbranch.name as string;
				} else {
					ref = DEFAULT_BRANCH;
				}
			} catch {
				// well find out it isn't correct later with a better error
				ref = DEFAULT_BRANCH;
			}
		}

		return {
			owner,
			ref,
			repoName,
			url: normalizedUrl,
			provider: bitbucket,
		} satisfies BitBucketProviderState;
	},

	resolveRaw: async (state, resourcePath, tag) => {
		// essentially assert that we are using the correct state
		if (state.provider.name !== bitbucket.name) {
			throw new Error(
				`You passed the incorrect state object (${state.provider.name}) to the ${bitbucket.name} provider.`
			);
		}

		const { owner, repoName, ref } = state as BitBucketProviderState;

		return new URL(
			resourcePath,
			`https://api.bitbucket.org/2.0/repositories/${owner}/${repoName}/src/${tag ?? ref}/`
		);
	},

	authHeader: (token) => ['Authorization', `Bearer ${token}`],

	formatFetchError: (state, filePath) => {
		return `There was an error fetching \`${color.bold(filePath)}\` from ${color.bold(state.url)}.

${color.bold('This may be for one of the following reasons:')}
1. Either \`${color.bold(filePath)}\` or the containing repository doesn't exist
2. Your repository path is incorrect (wrong branch, wrong tag)
3. You are using an expired access token or a token that doesn't have access to this repository
4. The cached state for this git provider is incorrect (try using ${color.bold('--no-cache')})
`;
	},
};

const parseUrl = (
	url: string,
	{ fullyQualified = false }: ParseOptions
): { url: string; owner: string; repoName: string; ref?: string; specifier?: string } => {
	const repo = url.replaceAll(/(https:\/\/bitbucket.org\/)|(bitbucket\/)/g, '');

	let [owner, repoName, ...rest] = repo.split('/');

	let specifier: string | undefined;

	if (fullyQualified) {
		specifier = rest.slice(rest.length - 2).join('/');

		rest = rest.slice(0, rest.length - 2);
	}

	let ref: string | undefined;

	if (rest[0] === 'src') {
		ref = rest[1];
	}

	return {
		url: `bitbucket/${owner}/${repoName}${ref ? `/src/${ref}` : ''}`,
		specifier,
		owner,
		repoName: repoName,
		ref,
	};
};
