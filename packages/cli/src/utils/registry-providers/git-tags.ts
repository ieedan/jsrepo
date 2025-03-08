import nodeFetch from 'node-fetch';
import { getProviderToken, selectProvider } from './internal';
import { Err, Ok, type Result } from '../blocks/ts/result';

export const getGitTags = async (repoUrl: string): Promise<Result<string[], string>> => {
	const provider = selectProvider(repoUrl);

	if (!provider) {
		return Err('Invalid provider');
	}

	const token = getProviderToken(provider);

	switch (provider.name) {
		case 'github':
			return await getGithubTags(repoUrl, token);
		case 'gitlab':
			return await getGitlabTags(repoUrl, token);
		case 'bitbucket':
			return await getBitbucketTags(repoUrl, token);
		case 'azure':
			return await getAzureTags(repoUrl, token);
		case 'http':
			return await getHttpTags(repoUrl);
		default:
			return Err(`Unsupported provider ${provider.name} for git tags`);
	}
};

const getGithubTags = async (
	repoUrl: string,
	token?: string
): Promise<Result<string[], string>> => {
	const [owner, repo] = repoUrl.split('/').slice(-2);
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github.v3+json',
	};
	if (token) {
		headers['Authorization'] = `token ${token}`;
	}

	try {
		const response = await nodeFetch(`https://api.github.com/repos/${owner}/${repo}/tags`, {
			headers,
		});
		if (!response.ok) {
			return Err(`Failed to fetch GitHub tags: ${response.statusText}`);
		}
		const tags = (await response.json()) as { name: string }[];
		return Ok(tags.map((tag) => tag.name));
	} catch (error) {
		return Err(`Error fetching GitHub tags: ${error}`);
	}
};

const getGitlabTags = async (
	repoUrl: string,
	token?: string
): Promise<Result<string[], string>> => {
	const project = encodeURIComponent(repoUrl.split('gitlab.com/')[1]);
	const headers: Record<string, string> = {};
	if (token) {
		headers['PRIVATE-TOKEN'] = token;
	}

	try {
		const response = await nodeFetch(
			`https://gitlab.com/api/v4/projects/${project}/repository/tags`,
			{ headers }
		);
		if (!response.ok) {
			return Err(`Failed to fetch GitLab tags: ${response.statusText}`);
		}
		const tags = (await response.json()) as { name: string }[];
		return Ok(tags.map((tag) => tag.name));
	} catch (error) {
		return Err(`Error fetching GitLab tags: ${error}`);
	}
};

const getBitbucketTags = async (
	repoUrl: string,
	token?: string
): Promise<Result<string[], string>> => {
	const [workspace, repo] = repoUrl.split('/').slice(-2);
	const headers: Record<string, string> = {};
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	try {
		const response = await nodeFetch(
			`https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/refs/tags`,
			{ headers }
		);
		if (!response.ok) {
			return Err(`Failed to fetch Bitbucket tags: ${response.statusText}`);
		}
		const data = (await response.json()) as { values: { name: string }[] };
		return Ok(data.values.map((tag) => tag.name));
	} catch (error) {
		return Err(`Error fetching Bitbucket tags: ${error}`);
	}
};

const getAzureTags = async (repoUrl: string, token?: string): Promise<Result<string[], string>> => {
	const [org, project, repo] = repoUrl.split('/').slice(-3);
	const headers: Record<string, string> = {};
	if (token) {
		headers['Authorization'] = `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
	}

	try {
		const response = await nodeFetch(
			`https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}/refs?filter=tags/&api-version=6.0`,
			{ headers }
		);
		if (!response.ok) {
			return Err(`Failed to fetch Azure DevOps tags: ${response.statusText}`);
		}
		const data = (await response.json()) as { value: { name: string }[] };
		return Ok(data.value.map((ref) => ref.name.replace('refs/tags/', '')));
	} catch (error) {
		return Err(`Error fetching Azure DevOps tags: ${error}`);
	}
};

const getHttpTags = async (repoUrl: string): Promise<Result<string[], string>> => {
	// Try each Git provider's API endpoint first
	const providers = [
		{ tryFn: getGithubTags, name: 'GitHub' },
		{ tryFn: getGitlabTags, name: 'GitLab' },
		{ tryFn: getBitbucketTags, name: 'Bitbucket' },
		{ tryFn: getAzureTags, name: 'Azure DevOps' },
	];

	for (const { tryFn } of providers) {
		try {
			const result = await tryFn(repoUrl);
			if (result.isOk()) {
				return result;
			}
		} catch {
			// Continue to next provider if this one fails
			continue;
		}
	}

	// If all provider-specific attempts fail, try the generic /tags endpoint
	try {
		const response = await nodeFetch(`${repoUrl}/tags`);
		if (!response.ok) {
			return Err(`Failed to fetch tags from HTTP endpoint: ${response.statusText}`);
		}
		const tags = (await response.json()) as string[];
		return Ok(tags);
	} catch (error) {
		return Err(`Error fetching tags from HTTP endpoint: ${error}`);
	}
};
