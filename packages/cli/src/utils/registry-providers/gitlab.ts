import color from 'chalk';
import { startsWithOneOf } from '../blocks/ts/strings';
import * as u from '../blocks/ts/url';
import type { ParseOptions, RegistryProvider, RegistryProviderState } from './types';

const DEFAULT_BRANCH = 'main';

export interface GitLabProviderState extends RegistryProviderState {
	baseUrl: string;
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
 *
 * Self hosted:
 *
 * `gitlab:https://example.com/ieedan/std`
 */
export const gitlab: RegistryProvider = {
	name: 'gitlab',

	matches: (url) =>
		startsWithOneOf(url.toLowerCase(), ['gitlab/', 'gitlab:', 'https://gitlab.com']),

	parse: (url, opts) => {
		const parsed = parseUrl(url, opts);

		return {
			url: parsed.url,
			specifier: parsed.specifier,
		};
	},

	baseUrl: (url) => {
		const { baseUrl, owner, repoName } = parseUrl(url, { fullyQualified: false });

		return u.join(baseUrl, owner, repoName);
	},

	state: async (url, { token, fetch: f = fetch } = {}) => {
		let {
			baseUrl,
			url: normalizedUrl,
			owner,
			repoName,
			ref,
		} = parseUrl(url, { fullyQualified: false });

		// fetch default branch if ref was not provided
		if (ref === undefined) {
			try {
				const headers = new Headers();

				if (token !== undefined) {
					const [key, value] = gitlab.authHeader!(token);

					headers.append(key, value);
				}

				const response = await f(
					u.join(
						baseUrl,
						`api/v4/projects/${encodeURIComponent(`${owner}/${repoName}`)}`
					),
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
			baseUrl,
			url: normalizedUrl,
			provider: gitlab,
		} satisfies GitLabProviderState;
	},

	resolveRaw: async (state, resourcePath) => {
		// essentially assert that we are using the correct state
		if (state.provider.name !== gitlab.name) {
			throw new Error(
				`You passed the incorrect state object (${state.provider.name}) to the ${gitlab.name} provider.`
			);
		}

		const { baseUrl, owner, repoName, ref } = state as GitLabProviderState;

		return new URL(
			u.join(
				baseUrl,
				`api/v4/projects/${encodeURIComponent(`${owner}/${repoName}`)}`,
				`repository/files/${encodeURIComponent(resourcePath)}/raw?ref=${ref}`
			)
		);
	},

	authHeader: (token) => ['PRIVATE-TOKEN', token],

	formatFetchError: (state, filePath, error) => {
		return `There was an error fetching \`${color.bold(filePath)}\` from ${color.bold(state.url)}: ${error}.

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
): {
	url: string;
	baseUrl: string;
	owner: string;
	repoName: string;
	ref?: string;
	specifier?: string;
} => {
	let baseUrl = 'https://gitlab.com';

	if (url.startsWith('gitlab:')) {
		baseUrl = new URL(url.slice(7)).origin;
	}

	const repo = url.replaceAll(
		/gitlab\/|https:\/\/gitlab\.com\/|gitlab:https?:\/\/[a-zA-Z0-9-]+\.[a-zA-Z]+\//g,
		''
	);

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
		url: u.join(baseUrl, `${owner}/${repoName}${ref ? `/-/tree/${ref}` : ''}`),
		baseUrl,
		owner: owner,
		repoName: repoName,
		ref,
		specifier,
	};
};
