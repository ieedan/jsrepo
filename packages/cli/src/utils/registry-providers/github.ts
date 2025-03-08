import color from 'chalk';
import { Octokit } from 'octokit';
import { startsWithOneOf } from '../blocks/ts/strings';
import type { ParseOptions, RegistryProvider, RegistryProviderState } from './types';

const DEFAULT_BRANCH = 'main';

export interface GitHubProviderState extends RegistryProviderState {
	owner: string;
	repoName: string;
	refs: 'tags' | 'heads';
	ref: string;
}

/** Valid paths
 *
 * `https://github.com/<owner>/<repo>`
 *
 * `github/<owner>/<repo>`
 *
 * `github/<owner>/<repo>/tree/<ref>`
 */
export const github: RegistryProvider = {
	name: 'github',

	matches: (url) => startsWithOneOf(url.toLowerCase(), ['github', 'https://github.com']),

	parse: (url, opts) => {
		const parsed = parseUrl(url, opts);

		return {
			url: parsed.url,
			specifier: parsed.specifier,
		};
	},

	baseUrl: (url) => {
		const { owner, repoName } = parseUrl(url, { fullyQualified: false });

		return `https://github.com/${owner}/${repoName}`;
	},

	state: async (url, { token } = {}) => {
		let { url: normalizedUrl, owner, repoName, ref } = parseUrl(url, { fullyQualified: false });

		const octokit = new Octokit({ auth: token });

		// checks if the type of the ref is tags or heads
		let refs: 'heads' | 'tags' = 'heads';

		// fetch default branch if ref was not provided
		if (ref === undefined) {
			try {
				const { data: repo } = await octokit.rest.repos.get({
					owner,
					repo: repoName,
				});

				ref = repo.default_branch;
			} catch {
				// we just want to continue on blissfully unaware the user will get an error later
				ref = DEFAULT_BRANCH;
			}
		} else {
			// no need to check if ref is main

			// this isn't a double case it's possible that DEFAULT_BRANCH and repo.default_branch are not equal
			if (ref !== DEFAULT_BRANCH) {
				try {
					const { data: tags } = await octokit.rest.git.listMatchingRefs({
						owner,
						repo: repoName,
						ref: 'tags',
					});

					if (tags.some((tag) => tag.ref === `refs/tags/${ref}`)) {
						refs = 'tags';
					}
				} catch {
					refs = 'heads';
				}
			}
		}

		return {
			owner,
			refs,
			ref,
			repoName,
			url: normalizedUrl,
			provider: github,
		} satisfies GitHubProviderState;
	},

	resolveRaw: async (state, resourcePath, tag) => {
		// essentially assert that we are using the correct state
		if (state.provider.name !== github.name) {
			throw new Error(
				`You passed the incorrect state object (${state.provider.name}) to the ${github.name} provider.`
			);
		}

		const { owner, repoName, refs, ref } = state as GitHubProviderState;

		return new URL(
			resourcePath,
			tag
				? `https://raw.githubusercontent.com/${owner}/${repoName}/${tag}/`
				: `https://raw.githubusercontent.com/${owner}/${repoName}/refs/${refs}/${ref}/`
		);
	},

	authHeader: (token) => ['Authorization', `token ${token}`],

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
): {
	url: string;
	owner: string;
	repoName: string;
	ref?: string;
	specifier?: string;
} => {
	const repo = url.replaceAll(/(https:\/\/github.com\/)|(github\/)/g, '');

	let [owner, repoName, ...rest] = repo.split('/');

	let specifier: string | undefined;

	if (fullyQualified) {
		specifier = rest.slice(rest.length - 2).join('/');

		rest = rest.slice(0, rest.length - 2);
	}

	let ref: string | undefined;

	if (rest.length > 0) {
		if (rest[0] === 'tree') {
			ref = rest[1];
		}
	}

	return {
		url: `github/${owner}/${repoName}${ref ? `/tree/${ref}` : ''}`,
		specifier,
		owner,
		repoName: repoName,
		ref,
	};
};
