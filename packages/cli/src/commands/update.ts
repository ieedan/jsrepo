import fs from 'node:fs';
import { cancel, confirm, isCancel, log, multiselect, outro } from '@clack/prompts';
import color from 'chalk';
import { Command, program } from 'commander';
import { resolveCommand } from 'package-manager-detector/commands';
import { detect } from 'package-manager-detector/detect';
import * as v from 'valibot';
import * as ascii from '../utils/ascii';
import { getBlockFilePath, getInstalled, preloadBlocks, resolveTree } from '../utils/blocks';
import * as url from '../utils/blocks/ts/url';
import { getProjectConfig, resolvePaths } from '../utils/config';
import { transformRemoteContent } from '../utils/files';
import { loadFormatterConfig } from '../utils/format';
import { getWatermark } from '../utils/get-watermark';
import { checkPreconditions } from '../utils/preconditions';
import {
	intro,
	nextSteps,
	promptInstallDependencies,
	promptUpdateFile,
	spinner,
} from '../utils/prompts';
import * as registry from '../utils/registry-providers/internal';
import { verifySecureRegistry } from '../utils/secure-registry';

const schema = v.object({
	all: v.boolean(),
	expand: v.boolean(),
	maxUnchanged: v.number(),
	no: v.boolean(),
	repo: v.optional(v.string()),
	allow: v.boolean(),
	yes: v.boolean(),
	cache: v.boolean(),
	verbose: v.boolean(),
	cwd: v.string(),
	publicKeyUrl: v.optional(v.string()), // Optional custom URL for public key
});

type Options = v.InferInput<typeof schema>;

const update = new Command('update')
	.description('Update blocks to the code in the remote repository.')
	.argument('[blocks...]', 'Names of the blocks you want to update. ex: (utils/math)')
	.option('--all', 'Update all installed components.', false)
	.option('-E, --expand', 'Expands the diff so you see the entire file.', false)
	.option(
		'--max-unchanged <number>',
		'Maximum unchanged lines that will show without being collapsed.',
		(val) => Number.parseInt(val), // this is such a dumb api thing
		3
	)
	.option('-n, --no', 'Do update any blocks.', false)
	.option('--repo <repo>', 'Repository to download the blocks from.')
	.option('-A, --allow', 'Allow jsrepo to download code from the provided repo.', false)
	.option('-y, --yes', 'Skip confirmation prompt.', false)
	.option('--no-cache', 'Disable caching of resolved git urls.')
	.option('--verbose', 'Include debug logs.', false)
	.option('--cwd <path>', 'The current working directory.', process.cwd())
	.action(async (blockNames, opts) => {
		const options = v.parse(schema, opts);

		await intro();

		await _update(blockNames, options);

		outro(color.green('All done!'));
	});

const _update = async (blockNames: string[], options: Options) => {
	const verbose = (msg: string) => {
		if (options.verbose) {
			console.info(`${ascii.INFO} ${msg}`);
		}
	};

	verbose(`Attempting to update ${JSON.stringify(blockNames)}`);

	const loading = spinner({ verbose: options.verbose ? verbose : undefined });

	const config = getProjectConfig(options.cwd).match(
		(val) => val,
		(err) => program.error(color.red(err))
	);

	let repoPaths = config.repos;

	// we just want to override all others if supplied via the CLI
	if (options.repo) repoPaths = [options.repo];

	// ensure blocks do not provide repos
	for (const blockSpecifier of blockNames) {
		if (registry.providers.find((p) => blockSpecifier.startsWith(p.name))) {
			program.error(
				color.red(
					`Invalid value provided for block names \`${color.bold(blockSpecifier)}\`. Block names are expected to be provided in the format of \`${color.bold('<category>/<name>')}\``
				)
			);
		}
	}

	if (!options.allow && options.repo) {
		const result = await confirm({
			message: `Allow ${color.cyan('jsrepo')} to download and run code from ${color.cyan(options.repo)}?`,
			initialValue: true,
		});

		if (isCancel(result) || !result) {
			cancel('Canceled!');
			process.exit(0);
		}
	}

	if (!options.verbose) loading.start(`Fetching blocks from ${color.cyan(repoPaths.join(', '))}`);

	const resolvedRepos: registry.RegistryProviderState[] = (
		await registry.forEachPathGetProviderState(repoPaths, {
			noCache: !options.cache,
		})
	).match(
		(val) => val,
		({ repo, message }) => {
			loading.stop(`Failed to get info for ${color.cyan(repo)}`);
			program.error(color.red(message));
		}
	);

	verbose(`Resolved ${color.cyan(repoPaths.join(', '))}`);

	verbose(`Fetching blocks from ${color.cyan(repoPaths.join(', '))}`);

	const manifests = (await registry.fetchManifests(...resolvedRepos)).match(
		(v) => v,
		({ repo, message }) => {
			loading.stop(`Failed fetching blocks from ${color.cyan(repo)}`);
			program.error(color.red(message));
		}
	);

	// Verify secure registries
	for (const manifest of manifests) {
		const verification = await verifySecureRegistry(manifest.state, manifest.manifest);

		if (verification.isSecure) {
			if (verification.isVerified) {
				log.info(`Verified secure registry: ${color.cyan(manifest.state.url)}`);
				verbose(`Signature: ${color.cyan(verification.signature)}`);
			} else {
				// If public key URL is provided, we could implement fetching it
				if (verification.publicKeyUrl || options.publicKeyUrl) {
					// TODO: Implement fetching and saving public key
					log.warn(
						`Public key not found locally. You can download it from: ${color.cyan(
							options.publicKeyUrl || verification.publicKeyUrl
						)}`
					);
				}
				program.error(
					color.red(
						`Failed to verify secure registry ${color.cyan(
							manifest.state.url
						)}. Registry signature verification failed.`
					)
				);
			}
		}
	}

	const blocksMap = registry.getRemoteBlocks(manifests);

	if (!options.verbose) loading.stop(`Retrieved blocks from ${color.cyan(repoPaths.join(', '))}`);

	verbose(`Retrieved blocks from ${color.cyan(repoPaths.join(', '))}`);

	for (const manifest of manifests) {
		checkPreconditions(manifest.state, manifest.manifest, options.cwd);
	}

	const installedBlocks = getInstalled(blocksMap, config, options.cwd);

	if (installedBlocks.length === 0) {
		program.error(
			color.red(
				`You haven't installed any blocks yet. Did you mean to \`${color.bold('add')}\`?`
			)
		);
	}

	let updatingBlockNames = blockNames;

	if (options.all) {
		updatingBlockNames = installedBlocks.map((block) => block.specifier);
	}

	// if no blocks are provided prompt the user for what blocks they want
	if (updatingBlockNames.length === 0) {
		const promptResult = await multiselect({
			message: `Which blocks would you like to ${options.no ? 'diff' : 'update'}?`,
			options: installedBlocks
				.filter((b) => b.block.list)
				.map((block) => {
					return {
						label: `${color.cyan(block.block.category)}/${block.block.name}`,
						value: block.specifier,
					};
				}),
			required: true,
		});

		if (isCancel(promptResult)) {
			cancel('Canceled!');
			process.exit(0);
		}

		updatingBlockNames = promptResult as string[];
	}

	verbose(`Preparing to update ${color.cyan(updatingBlockNames.join(', '))}`);

	const updatingBlocks = (await resolveTree(updatingBlockNames, blocksMap, resolvedRepos)).match(
		(val) => val,
		program.error
	);

	const devDeps: Set<string> = new Set<string>();
	const deps: Set<string> = new Set<string>();

	const { prettierOptions, biomeOptions } = await loadFormatterConfig({
		formatter: config.formatter,
		cwd: options.cwd,
	});

	const resolvedPaths = resolvePaths(config.paths, options.cwd).match(
		(v) => v,
		(err) => program.error(color.red(err))
	);

	const preloadedBlocks = preloadBlocks(updatingBlocks, config);

	for (const preloadedBlock of preloadedBlocks) {
		const fullSpecifier = url.join(
			preloadedBlock.block.sourceRepo.url,
			preloadedBlock.block.category,
			preloadedBlock.block.name
		);

		const watermark = getWatermark(preloadedBlock.block.sourceRepo.url);

		verbose(`Attempting to update ${fullSpecifier}`);

		if (config.includeTests && preloadedBlock.block.tests) {
			verbose('Trying to include tests');

			devDeps.add('vitest');
		}

		for (const dep of preloadedBlock.block.devDependencies) {
			devDeps.add(dep);
		}

		for (const dep of preloadedBlock.block.dependencies) {
			deps.add(dep);
		}

		const files = await preloadedBlock.files;

		process.stdout.write(`${ascii.VERTICAL_LINE}\n`);

		process.stdout.write(`${ascii.VERTICAL_LINE}  ${fullSpecifier}\n`);

		for (const file of files) {
			const content = file.content.match(
				(v) => v,
				(err) => program.error(color.red(err))
			);

			const destPath = getBlockFilePath(
				file.name,
				preloadedBlock.block,
				resolvedPaths,
				options.cwd
			);

			const remoteContent = (
				await transformRemoteContent({
					file: {
						content,
						destPath: destPath,
					},
					biomeOptions,
					prettierOptions,
					config,
					imports: preloadedBlock.block._imports_,
					watermark,
					verbose,
					cwd: options.cwd,
				})
			).match(
				(v) => v,
				(err) => program.error(color.red(err))
			);

			let localContent = '';
			if (fs.existsSync(destPath)) {
				localContent = fs.readFileSync(destPath).toString();
			}

			const updateResult = await promptUpdateFile({
				config: { biomeOptions, prettierOptions, formatter: config.formatter },
				current: {
					path: destPath,
					content: localContent,
				},
				incoming: {
					path: url.join(fullSpecifier, file.name),
					content: remoteContent,
				},
				options: {
					...options,
					loading,
					verbose: options.verbose ? verbose : undefined,
				},
			});

			if (updateResult.applyChanges) {
				loading.start(`Writing changes to ${color.cyan(destPath)}`);

				fs.writeFileSync(destPath, updateResult.updatedContent);

				loading.stop(`Wrote changes to ${color.cyan(destPath)}.`);
			}
		}
	}

	const pm = (await detect({ cwd: options.cwd }))?.agent ?? 'npm';

	const installResult = await promptInstallDependencies(deps, devDeps, {
		yes: options.yes,
		no: options.no,
		cwd: options.cwd,
		pm,
	});

	if (installResult.dependencies.size > 0 || installResult.devDependencies.size > 0) {
		// next steps if they didn't install dependencies
		let steps = [];

		if (!installResult.installed) {
			if (deps.size > 0) {
				const cmd = resolveCommand(pm, 'add', [...deps]);

				steps.push(
					`Install dependencies \`${color.cyan(`${cmd?.command} ${cmd?.args.join(' ')}`)}\``
				);
			}

			if (devDeps.size > 0) {
				const cmd = resolveCommand(pm, 'add', [...devDeps, '-D']);

				steps.push(
					`Install dev dependencies \`${color.cyan(`${cmd?.command} ${cmd?.args.join(' ')}`)}\``
				);
			}
		}

		// put steps with numbers above here
		steps = steps.map((step, i) => `${i + 1}. ${step}`);

		if (!installResult.installed) {
			steps.push('');
		}

		steps.push('Import and use the blocks!');

		const next = nextSteps(steps);

		process.stdout.write(next);
	}
};

export { update };
