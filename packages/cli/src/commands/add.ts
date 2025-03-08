import fs from 'node:fs';
import { cancel, confirm, isCancel, log, multiselect, outro, select, text } from '@clack/prompts';
import color from 'chalk';
import { Command, program } from 'commander';
import { resolveCommand } from 'package-manager-detector/commands';
import { detect } from 'package-manager-detector/detect';
import path from 'pathe';
import * as v from 'valibot';
import * as ascii from '../utils/ascii';
import { getBlockFilePath, getInstalled, preloadBlocks, resolveTree } from '../utils/blocks';
import * as promises from '../utils/blocks/ts/promises';
import * as url from '../utils/blocks/ts/url';
import {
	type Formatter,
	type ProjectConfig,
	getProjectConfig,
	projectConfigSchema,
	resolvePaths,
} from '../utils/config';
import { transformRemoteContent } from '../utils/files';
import { loadFormatterConfig } from '../utils/format';
import { getWatermark } from '../utils/get-watermark';
import * as persisted from '../utils/persisted';
import { checkPreconditions } from '../utils/preconditions';
import {
	intro,
	nextSteps,
	promptInstallDependencies,
	promptUpdateFile,
	spinner,
	truncatedList,
} from '../utils/prompts';
import * as registry from '../utils/registry-providers/internal';
import { verifySecureRegistry } from '../utils/secure-registry';

const schema = v.object({
	expand: v.boolean(),
	maxUnchanged: v.number(),
	repo: v.optional(v.string()),
	allow: v.boolean(),
	yes: v.boolean(),
	cache: v.boolean(),
	verbose: v.boolean(),
	cwd: v.string(),
	publicKeyUrl: v.optional(v.string()), // Optional custom URL for public key
});

type Options = v.InferInput<typeof schema>;

export const add = new Command('add')
	.description('Add blocks to your project.')
	.argument(
		'[blocks...]',
		'Names of the blocks you want to add to your project. ex: (utils/math, github/ieedan/std/utils/math)'
	)
	.option('-E, --expand', 'Expands the diff so you see the entire file.', false)
	.option(
		'--max-unchanged <number>',
		'Maximum unchanged lines that will show without being collapsed.',
		(val) => Number.parseInt(val), // this is such a dumb api thing
		3
	)
	.option('--repo <repo>', 'Repository to download the blocks from.')
	.option('-A, --allow', 'Allow jsrepo to download code from the provided repo.', false)
	.option('-y, --yes', 'Skip confirmation prompt.', false)
	.option('--no-cache', 'Disable caching of resolved git urls.')
	.option('--verbose', 'Include debug logs.', false)
	.option('--cwd <path>', 'The current working directory.', process.cwd())
	.action(async (blockNames, opts) => {
		const options = v.parse(schema, opts);

		await intro();

		await _add(blockNames, options);

		outro(color.green('All done!'));
	});

const _add = async (blockNames: string[], options: Options) => {
	const verbose = (msg: string) => {
		if (options.verbose) {
			console.info(`${ascii.INFO} ${msg}`);
		}
	};

	verbose(`Attempting to add ${JSON.stringify(blockNames)}`);

	const loading = spinner({ verbose: options.verbose ? verbose : undefined });

	const configResult = getProjectConfig(options.cwd);

	/** The user has opted for no config */
	const noConfig = configResult.isErr();

	let config: ProjectConfig;

	if (configResult.isErr()) {
		let shouldContinue = options.yes;

		if (!options.yes) {
			const response = await confirm({
				message: `You don't have ${ascii.JSREPO} initialized in your project. Do you want to continue?`,
				initialValue: false,
			});

			if (isCancel(response)) {
				cancel('Canceled!');
				process.exit(0);
			}

			shouldContinue = response;
		}

		if (!shouldContinue) {
			cancel('Canceled!');
			process.exit(0);
		}

		// add default config used for default values in prompts
		config = {
			$schema: '',
			includeTests: false,
			watermark: true,
			paths: {
				'*': './src/blocks',
			},
			repos: [],
		};
	} else {
		config = configResult.unwrap();
	}

	let repoPaths = config.repos;
	const mustResolveRepos = new Set<string>();
	let resolveAllRepos = false;

	// we just want to override all others if supplied via the CLI
	if (options.repo) {
		repoPaths = [options.repo];
	}

	// resolve repos for blocks
	for (const blockSpecifier of blockNames) {
		const provider = registry.selectProvider(blockSpecifier);

		// we are only getting repos for blocks that specified repos
		if (!provider) {
			// if a block doesn't specify a repo we must resolve all
			resolveAllRepos = true;
			continue;
		}

		const { url: repo } = provider.parse(blockSpecifier, {
			fullyQualified: true,
		});

		const alreadyExists =
			!config.repos.find((repoPath) => repoPath === repo) && !mustResolveRepos.has(repo);

		if (!alreadyExists) {
			if (!options.allow) {
				const result = await confirm({
					message: `Allow ${ascii.JSREPO} to download and run code from ${color.cyan(repo)}?`,
					initialValue: true,
				});

				if (isCancel(result) || !result) {
					cancel('Canceled!');
					process.exit(0);
				}
			}

			// only add if it doesn't exist
			repoPaths.push(repo);
		}

		// this way we add the config.repos as well
		mustResolveRepos.add(repo);
	}

	if (!resolveAllRepos && blockNames.length > 0) {
		repoPaths = Array.from(mustResolveRepos);
	}

	if (!options.allow && options.repo) {
		const result = await confirm({
			message: `Allow ${ascii.JSREPO} to download and run code from ${color.cyan(options.repo)}?`,
			initialValue: true,
		});

		if (isCancel(result) || !result) {
			cancel('Canceled!');
			process.exit(0);
		}
	}

	if (repoPaths.length === 0) {
		if (noConfig) {
			program.error(
				color.red(
					`Fully quality blocks ex: (github/ieedan/std/utils/math) or provide the \`${color.bold(
						'--repo'
					)}\` flag to specify a registry.`
				)
			);
		}

		program.error(
			color.red(
				`There were no repos present in your config and you didn't provide the \`${color.bold(
					'--repo'
				)}\` flag with a repo.`
			)
		);
	}

	verbose(`Resolving ${color.cyan(repoPaths.join(', '))}`);

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

	let installedBlocks = getInstalled(blocksMap, config, options.cwd).map((val) => val.specifier);

	let installingBlockNames = blockNames;

	// if no blocks are provided prompt the user for what blocks they want
	if (installingBlockNames.length === 0) {
		const promptResult = await multiselect({
			message: 'Select which blocks to add.',
			options: Array.from(blocksMap.entries())
				.filter(([_, value]) => value.list)
				.map(([key, value]) => {
					const shortName = `${value.category}/${value.name}`;

					const blockExists =
						installedBlocks.findIndex((block) => block === shortName) !== -1;

					let label: string;

					// show the full repo if there are multiple repos
					if (repoPaths.length > 1) {
						label = `${color.cyan(url.join(value.sourceRepo.url, value.category))}/${value.name}`;
					} else {
						label = `${color.cyan(value.category)}/${value.name}`;
					}

					return {
						label: blockExists ? color.gray(label) : label,
						value: key,
						// show hint for `Installed` if block is already installed
						hint: blockExists ? 'Installed' : undefined,
					};
				}),
			required: true,
		});

		if (isCancel(promptResult)) {
			cancel('Canceled!');
			process.exit(0);
		}

		installingBlockNames = promptResult as string[];
	}

	verbose(`Installing blocks ${color.cyan(installingBlockNames.join(', '))}`);

	const installingBlocks = (
		await resolveTree(installingBlockNames, blocksMap, resolvedRepos)
	).match(
		(val) => val,
		(err) => program.error(err)
	);

	const devDeps: Set<string> = new Set<string>();
	const deps: Set<string> = new Set<string>();

	const store = persisted.get();

	if (noConfig) {
		const zeroConfigKey = `${options.cwd}-zero-config`;

		const zeroConfigParsed = v.safeParse(projectConfigSchema, store.get(zeroConfigKey));

		const zeroConfig = zeroConfigParsed.success ? zeroConfigParsed.output : config;

		const categories = Array.from(new Set(installingBlocks.map((b) => b.category)));

		for (const cat of categories) {
			const blocksPath = await text({
				message: `Where would you like to add ${color.cyan(cat)}?`,
				placeholder: zeroConfig ? zeroConfig.paths[cat] : `./src/${cat}`,
				initialValue: zeroConfig ? zeroConfig.paths[cat] : `./src/${cat}`,
				defaultValue: zeroConfig ? zeroConfig.paths[cat] : `./src/${cat}`,
				validate(value) {
					if (value.trim() === '') return 'Please provide a value';
				},
			});

			if (isCancel(blocksPath)) {
				cancel('Canceled!');
				process.exit(0);
			}

			config.paths[cat] = blocksPath;
		}

		if (!options.yes) {
			const includeTests = await confirm({
				message: 'Include tests?',
				initialValue: zeroConfig.includeTests,
			});

			if (isCancel(includeTests)) {
				cancel('Canceled!');
				process.exit(0);
			}

			config.includeTests = includeTests;

			const addWatermark = await confirm({
				message: 'Add watermark?',
				initialValue: zeroConfig.watermark,
			});

			if (isCancel(addWatermark)) {
				cancel('Canceled!');
				process.exit(0);
			}

			config.watermark = addWatermark;
		}

		let defaultFormatter = 'none';

		if (fs.existsSync(path.join(options.cwd, '.prettierrc'))) {
			defaultFormatter = 'prettier';
		}

		if (fs.existsSync(path.join(options.cwd, 'biome.json'))) {
			defaultFormatter = 'biome';
		}

		const response = await select({
			message: 'What formatter would you like to use?',
			options: ['Prettier', 'Biome', 'None'].map((val) => ({
				value: val.toLowerCase(),
				label: val,
			})),
			initialValue:
				defaultFormatter === 'none'
					? zeroConfig.formatter
						? zeroConfig.formatter
						: 'none'
					: defaultFormatter,
		});

		if (isCancel(response)) {
			cancel('Canceled!');
			process.exit(0);
		}

		if (response !== 'none') {
			config.formatter = response as Formatter;
		}

		store.set(zeroConfigKey, config);

		// re-run to get installed blocks at the provided path
		installedBlocks = getInstalled(blocksMap, config, options.cwd).map((val) => val.specifier);
	}

	const { prettierOptions, biomeOptions } = await loadFormatterConfig({
		formatter: config.formatter,
		cwd: options.cwd,
	});

	const resolvedPaths = resolvePaths(config.paths, options.cwd).match(
		(v) => v,
		(err) => program.error(color.red(err))
	);

	const updatedBlocks = new Set<string>();

	let overwriteAll: boolean | undefined;

	const preloadedBlocks = preloadBlocks(installingBlocks, config);

	const updatedFiles: Promise<{
		destination: string;
		content: string;
		block: registry.RemoteBlock;
	}>[] = [];

	for (const preloadedBlock of preloadedBlocks) {
		const fullSpecifier = url.join(
			preloadedBlock.block.sourceRepo.url,
			preloadedBlock.block.category,
			preloadedBlock.block.name
		);
		const shortSpecifier = `${preloadedBlock.block.category}/${preloadedBlock.block.name}`;

		verbose(`Setting up ${fullSpecifier}`);

		const blockExists = installedBlocks.find((b) => shortSpecifier === b);

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

		if (blockExists && !options.yes && !overwriteAll) {
			if (overwriteAll === undefined) {
				const overwriteBlocks = installingBlocks
					.map((installing) => `${installing.category}/${installing.name}`)
					.filter((spec) => installedBlocks.find((b) => b === spec));

				log.warn(
					`The following components ${color.bold.yellow('already exist')}: ${color.cyan(truncatedList(overwriteBlocks))}`
				);

				const overwrite = await confirm({
					message: `Would you like to ${color.bold.red('overwrite')} all existing components?`,
					active: 'Yes, overwrite everything',
					inactive: 'No, let me decide individually',
					initialValue: false,
				});

				if (isCancel(overwrite)) {
					cancel('Canceled!');
					process.exit(0);
				}

				overwriteAll = overwrite;
			}

			if (!overwriteAll) {
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
								content: content,
								destPath: destPath,
							},
							biomeOptions,
							prettierOptions,
							config,
							imports: preloadedBlock.block._imports_,
							watermark: getWatermark(preloadedBlock.block.sourceRepo.url),
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
						config: {
							biomeOptions,
							prettierOptions,
							formatter: config.formatter,
						},
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
							no: false,
							verbose: options.verbose ? verbose : undefined,
						},
					});

					if (updateResult.applyChanges) {
						updatedFiles.push(
							promises.noopPromise({
								destination: destPath,
								content: updateResult.updatedContent,
								block: preloadedBlock.block,
							})
						);

						updatedBlocks.add(shortSpecifier);
					}
				}

				continue;
			}
		}

		// once files load map over them and add them to updatedFiles
		preloadedBlock.files.then((files) => {
			files.map(async (file) => {
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

				const updatedFile = transformRemoteContent({
					file: {
						content,
						destPath: destPath,
					},
					biomeOptions,
					prettierOptions,
					config,
					imports: preloadedBlock.block._imports_,
					watermark: getWatermark(preloadedBlock.block.sourceRepo.url),
					verbose,
					cwd: options.cwd,
				}).then((remoteContent) => {
					if (remoteContent.isErr()) {
						program.error(color.red(remoteContent.unwrapErr()));
					}

					return {
						destination: destPath,
						content: remoteContent.unwrap(),
						block: preloadedBlock.block,
					};
				});

				updatedFiles.push(updatedFile);
			});
		});

		updatedBlocks.add(shortSpecifier);
	}

	if (updatedBlocks.size === 0) {
		log.success('Nothing to update');
	} else {
		loading.start('Adding blocks');

		// wait for any remaining files to finish loading
		await Promise.all(preloadedBlocks.map((p) => p.files));

		await Promise.all(
			updatedFiles.map(async (updatedFile) => {
				const file = await updatedFile;

				const folder = path.dirname(file.destination);

				if (!fs.existsSync(folder)) {
					verbose(`Creating directory ${color.bold(folder)}`);

					fs.mkdirSync(folder, {
						recursive: true,
					});
				}

				verbose(`Writing to ${color.bold(file.destination)}`);

				fs.writeFileSync(file.destination, file.content);
			})
		);

		loading.stop(`Added blocks ${color.cyan(Array.from(updatedBlocks).join(', '))}`);
	}

	const pm = (await detect({ cwd: options.cwd }))?.agent ?? 'npm';

	const installResult = await promptInstallDependencies(deps, devDeps, {
		yes: options.yes,
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
