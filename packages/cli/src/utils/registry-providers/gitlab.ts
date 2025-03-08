import color from 'chalk';
import { startsWithOneOf } from '../blocks/ts/strings';
import type { ParseOptions, RegistryProvider, RegistryProviderState } from './types';

const DEFAULT_BRANCH = 'main';

export interface GitLabProviderState extends RegistryProviderState {
	owner: string;
	repoName: string;
	ref: string;
}

/** Valid paths
 *
 * `https://gitlab.com/ieedan/std`
 *
 * `https://gitlab.com/ieedan/std/-/tree/next`
 *
 * `https://gitlab.com/ieedan/std/-/tree/v2.0.0`
 *
 * `https://gitlab.com/ieedan/std/-/tree/v2.0.0?ref_type=tags`
 */
export const gitlab: RegistryProvider = {
	name: 'gitlab',

	matches: (url) => startsWithOneOf(url.toLowerCase(), ['gitlab', 'https://gitlab.com']),

	parse: (url, opts) => {
		const parsed = parseUrl(url, opts);

		return {
			url: parsed.url,
			specifier: parsed.specifier,
		};
	},

	baseUrl: (url) => {
		const { owner, repoName } = parseUrl(url, { fullyQualified: false });

		return `https://gitlab.com/${owner}/${repoName}`;
	},

	state: async (url, { token, fetch: f = fetch } = {}) => {
		let { url: normalizedUrl, owner, repoName, ref } = parseUrl(url, { fullyQualified: false });

		// fetch default branch if ref was not provided
		if (ref === undefined) {
			try {
				const headers = new Headers();

				if (token !== undefined) {
					const [key, value] = gitlab.authHeader!(token);

					headers.append(key, value);
				}

				const response = await f(
					`https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repoName}`)}`,
					{
						headers,
					}
				);

				if (response.ok) {
					const data = await response.json();

					// @ts-ignore yes but we know
					ref = data.default_branch as string;
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
			repoName,
			ref,
			url: normalizedUrl,
			provider: gitlab,
		} satisfies GitLabProviderState;
	},

	resolveRaw: async (state, resourcePath, tag) => {
		// essentially assert that we are using the correct state
		if (state.provider.name !== gitlab.name) {
			throw new Error(
				`You passed the incorrect state object (${state.provider.name}) to the ${gitlab.name} provider.`
			);
		}

		const { owner, repoName, ref } = state as GitLabProviderState;

		return new URL(
			`${encodeURIComponent(resourcePath)}/raw?ref=${tag ?? ref}`,
			`https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repoName}`)}/repository/files/`
		);
	},

	authHeader: (token) => ['PRIVATE-TOKEN', token],

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
	{ fullyQualified }: ParseOptions
): { url: string; owner: string; repoName: string; ref?: string; specifier?: string } => {
	const repo = url.replaceAll(/(https:\/\/gitlab.com\/)|(gitlab\/)/g, '');

	let [owner, repoName, ...rest] = repo.split('/');

	let specifier: string | undefined;

	if (fullyQualified) {
		specifier = rest.slice(rest.length - 2).join('/');

		rest = rest.slice(0, rest.length - 2);
	}

	let ref: string | undefined;

	if (rest[0] === '-' && rest[1] === 'tree') {
		if (rest[2].includes('?')) {
			const [tempRef] = rest[2].split('?');

			ref = tempRef;
		} else {
			ref = rest[2];
		}
	}

	return {
		url: `gitlab/${owner}/${repoName}${ref ? `/-/tree/${ref}` : ''}`,
		owner: owner,
		repoName: repoName,
		ref,
		specifier,
	};
};
