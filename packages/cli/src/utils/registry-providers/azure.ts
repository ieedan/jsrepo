import color from 'chalk';
import type { ParseOptions, RegistryProvider, RegistryProviderState } from './types';

const DEFAULT_BRANCH = 'main';

export interface AzureProviderState extends RegistryProviderState {
	owner: string;
	repoName: string;
	project: string;
	refs: 'heads' | 'tags';
	ref: string;
}

/** Valid paths
 *
 *  `azure/<org>/<project>/<repo>/(tags|heads)/<ref>`
 */
export const azure: RegistryProvider = {
	name: 'azure',

	matches: (url) => url.toLowerCase().startsWith('azure'),

	parse: (url, opts) => {
		const parsed = parseUrl(url, opts);

		return {
			url: parsed.url,
			specifier: parsed.specifier,
		};
	},

	baseUrl: (url) => {
		const { owner, repoName } = parseUrl(url, { fullyQualified: false });

		return `https://dev.azure.com/${owner}/_git/${repoName}`;
	},

	state: async (url) => {
		const {
			url: normalizedUrl,
			owner,
			project,
			repoName,
			ref,
			refs,
		} = parseUrl(url, { fullyQualified: false });

		return {
			owner,
			repoName,
			ref,
			refs,
			project,
			url: normalizedUrl,
			provider: azure,
		} satisfies AzureProviderState;
	},

	resolveRaw: async (state, resourcePath, tag) => {
		// essentially assert that we are using the correct state
		if (state.provider.name !== azure.name) {
			throw new Error(
				`You passed the incorrect state object (${state.provider.name}) to the ${azure.name} provider.`
			);
		}

		const { owner, repoName, project, ref, refs } = state as AzureProviderState;

		const versionType = refs === 'tags' ? 'tag' : 'branch';

		return new URL(
			`https://dev.azure.com/${owner}/${project}/_apis/git/repositories/${repoName}/items?path=${resourcePath}&api-version=7.2-preview.1&versionDescriptor.version=${tag ?? ref}&versionDescriptor.versionType=${versionType}`
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
	{ fullyQualified }: ParseOptions
): {
	url: string;
	owner: string;
	project: string;
	repoName: string;
	ref: string;
	refs: 'tags' | 'heads';
	specifier?: string;
} => {
	const repo = url.replaceAll(/(azure\/)/g, '');

	let [owner, project, repoName, ...rest] = repo.split('/');

	let specifier: string | undefined = undefined;

	if (fullyQualified) {
		specifier = rest.slice(rest.length - 2).join('/');

		rest = rest.slice(0, rest.length - 2);
	}

	let ref: string = DEFAULT_BRANCH;

	// checks if the type of the ref is tags or heads
	let refs: 'heads' | 'tags' = 'heads';

	if (['tags', 'heads'].includes(rest[0])) {
		refs = rest[0] as 'heads' | 'tags';

		if (rest[1] && rest[1] !== '') {
			ref = rest[1];
		}
	}

	return {
		url: `azure/${owner}/${project}/${repoName}${ref ? `/${refs}/${ref}` : ''}`,
		owner: owner,
		repoName: repoName,
		project,
		ref,
		refs,
		specifier,
	};
};
