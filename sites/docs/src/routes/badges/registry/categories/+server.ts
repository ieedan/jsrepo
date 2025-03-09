import { getProviderState, getProviderToken } from '$lib/ts/registry';
import { error } from '@sveltejs/kit';
import { fetchManifest, selectProvider } from 'jsrepo';
import { makeBadge } from 'badge-maker';

export const GET = async ({ url }: { url: URL }) => {
	const registryUrl = url.searchParams.get('url');

	if (registryUrl == null) throw error(400, 'Expected `url` search param');

	const provider = selectProvider(registryUrl);

	if (!provider) throw error(400, 'Invalid registry url');

	const state = await getProviderState(registryUrl, provider, { cache: true });

	const manifest = (
		await fetchManifest(state, {
			token: getProviderToken(state.provider, state.url)
		})
	).match(
		(v) => v,
		(err) => {
			throw error(400, `Error fetching manifest: ${err}`);
		}
	);

	const svg = makeBadge({
		label: 'jsrepo',
		labelColor: '#f7df1e',
		message: `${manifest.categories.length} categories`
	});

	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml'
		}
	});
};
