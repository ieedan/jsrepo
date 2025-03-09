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

	const dependencies = new Set<string>();

	for (const category of manifest.categories) {
		for (const block of category.blocks) {
			for (const dep of [...block.dependencies, ...block.devDependencies]) {
				dependencies.add(dep);
			}
		}
	}

	const svg = makeBadge({
		label: 'jsrepo',
		labelColor: '#f7df1e',
		message: `${dependencies.size} dependencies`
	});

	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml'
		}
	});
};
