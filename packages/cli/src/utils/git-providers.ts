import { Octokit } from 'octokit';
import * as v from 'valibot';
import { Err, Ok, type Result } from '../blocks/types/result';
import { type Category, categorySchema } from './build';
import { OUTPUT_FILE } from './index';

const octokit = new Octokit({});

export type Info = {
	refs: 'tags' | 'heads';
	url: string;
	name: string;
	repoName: string;
	owner: string;
	ref: string;
	provider: Provider;
};

export interface Provider {
	/** Get the name of the provider
	 *
	 * @returns the name of the provider
	 */
	name: () => string;
	/** Returns a URL to the raw path of the resource provided in the resourcePath
	 *
	 * @param repoPath
	 * @param resourcePath
	 * @returns
	 */
	resolveRaw: (repoPath: string | Info, resourcePath: string) => Promise<URL>;
	/** Parses the url and gives info about the repo
	 *
	 * @param repoPath
	 * @returns
	 */
	info: (repoPath: string) => Promise<Info>;
	/** Returns true if this provider matches the provided url
	 *
	 * @param repoPath
	 * @returns
	 */
	matches: (repoPath: string) => boolean;
}

/** Valid paths
 *
 *  `https://github.com/<owner>/<repo>/[tree]/[ref]`
 *
 *  `github/<owner>/<repo>/[tree]/[ref]`
 */
const github: Provider = {
	name: () => 'github',
	resolveRaw: async (repoPath, resourcePath) => {
		let info: Info;
		if (typeof repoPath === 'string') {
			info = await github.info(repoPath);
		} else {
			info = repoPath;
		}

		return new URL(
			resourcePath,
			`https://raw.githubusercontent.com/${info.owner}/${info.repoName}/refs/${info.refs}/${info.ref}/`
		);
	},
	info: async (repoPath) => {
		const repo = repoPath.replaceAll(/(https:\/\/github.com\/)|(github\/)/g, '');

		const [owner, repoName, ...rest] = repo.split('/');

		let ref = 'main';

		if (rest[0] === 'tree') {
			ref = rest[1];
		}

		// checks if the type of the ref is tags or heads
		let refs: 'heads' | 'tags' = 'heads';
		// no need to check if ref is main
		if (ref !== 'main') {
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

		return {
			refs,
			url: repoPath,
			name: github.name(),
			repoName,
			owner,
			ref: ref,
			provider: github,
		};
	},
	matches: (repoPath) =>
		repoPath.toLowerCase().startsWith('https://github.com') ||
		repoPath.toLowerCase().startsWith('github'),
};

const getProviderInfo = async (repo: string): Promise<Result<Info, string>> => {
	if (github.matches(repo)) {
		return Ok(await github.info(repo));
	}

	return Err('Only GitHub repositories are supported at this time!');
};

const getManifest = async (url: URL): Promise<Result<Category[], string>> => {
	try {
		const response = await fetch(url);

		if (!response.ok) {
			return Err(
				`There was an error fetching the \`${OUTPUT_FILE}\` from the repository \`${url.href}\` make sure the target repository has a \`${OUTPUT_FILE}\` in its root?`
			);
		}

		const categories = v.parse(v.array(categorySchema), await response.json());

		return Ok(categories);
	} catch {
		return Err(
			`There was an error fetching the \`${OUTPUT_FILE}\` from the repository \`${url.href}\` make sure the target repository has a \`${OUTPUT_FILE}\` in its root?`
		);
	}
};

export { github, getProviderInfo, getManifest };