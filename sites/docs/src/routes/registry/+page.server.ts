import { error, redirect } from '@sveltejs/kit';
import { selectProvider } from 'jsrepo';
import { getProviderState, getRegistryData } from '$lib/ts/registry/index.js';
import { action } from '$lib/ts/server-actions/search-registries/server.js';
import { dev } from '$app/environment';
import { functions } from '$lib/db/index.js';

export const load = async ({ url }) => {
	const registryUrl = url.searchParams.get('url');

	if (registryUrl == null) throw redirect(303, '/registries');

	const provider = selectProvider(registryUrl);

	if (!provider) throw redirect(303, '/registries');

	const state = await getProviderState(registryUrl, provider, { cache: true });

	const pageData = await getRegistryData(state);

	if (!pageData) {
		throw error(404, { message: 'registry-search: Could not find the requested registry' });
	}

	if (!dev) {
		await functions.tryIncrementViews(registryUrl);
	}

	return {
		...pageData,
		registryUrl
	};
};

export const actions = {
	default: action
};
