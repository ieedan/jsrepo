import fs from 'node:fs';
import {
	cancel,
	confirm,
	isCancel,
	log,
	multiselect,
	outro,
	password,
	select,
	spinner,
	text,
} from '@clack/prompts';
import color from 'chalk';
import { Command, Option, program } from 'commander';
import { createPathsMatcher } from 'get-tsconfig';
import { detect, resolveCommand } from 'package-manager-detector';
import path from 'pathe';
import * as v from 'valibot';
import * as ascii from '../utils/ascii';
import { parseRecord } from '../utils/blocks/commander/parsers';
import * as u from '../utils/blocks/ts/url';
import {
	type Formatter,
	PROJECT_CONFIG_NAME,
	type Paths,
	type ProjectConfig,
	REGISTRY_CONFIG_NAME,
	formatterSchema,
	getProjectConfig,
	getRegistryConfig,
} from '../utils/config';
import { packageJson } from '../utils/context';
import { formatFile, matchJSDescendant, tryGetTsconfig } from '../utils/files';
import { loadFormatterConfig } from '../utils/format';
import { json } from '../utils/language-support';
import type { PackageJson } from '../utils/package';
import { checkPreconditions } from '../utils/preconditions';
import {
	type Task,
	intro,
	nextSteps,
	promptInstallDependencies,
	promptUpdateFile,
	runTasks,
} from '../utils/prompts';
import * as registry from '../utils/registry-providers/internal';
import { TokenManager } from '../utils/token-manager';
import { CaseInsensitiveSet } from '../utils/case-insensitive-set';

const schema = v.object({
	repos: v.optional(v.array(v.string())),
	watermark: v.boolean(),
	tests: v.optional(v.boolean()),
	docs: v.optional(v.boolean()),
	formatter: v.optional(formatterSchema),
	paths: v.optional(v.record(v.string(), v.string())),
	configFiles: v.optional(v.record(v.string(), v.string())),
	project: v.optional(v.boolean()),
	registry: v.optional(v.boolean()),
	buildScript: v.string(),
	publishScript: v.string(),
	expand: v.boolean(),
	maxUnchanged: v.number(),
	yes: v.boolean(),
	cache: v.boolean(),
	cwd: v.string(),
});

type Options = v.InferInput<typeof schema>;

const init = new Command('init')
	.description('Initializes your project with a configuration file.')
	.argument('[registries...]', 'Registries to install the blocks from.', [])
	.option('--repos [repos...]', 'Repository to install the blocks from. (DEPRECATED)')
	.option(
		'--no-watermark',
		'Will not add a watermark to each file upon adding it to your project.'
	)
	.option('--tests', 'Will include tests with the blocks.')
	.option('--docs', 'Will include docs with the blocks.')
	.addOption(
		new Option(
			'--formatter <formatter>',
			'What formatter to use when adding or updating blocks.'
		).choices(['prettier', 'biome'])
	)
	.addOption(
		new Option('--paths <category=path>,<category=path>', 'The paths to install the blocks to.')
			.argParser(parseRecord)
			.default({})
	)
	.addOption(
		new Option(
			'--config-files <configFile=path>,<configFile=path>',
			'The paths to install the config files to.'
		)
			.argParser(parseRecord)
			.default({})
	)
	.option('-P, --project', 'Takes you through the steps to initialize a project.')
	.option('-R, --registry', 'Takes you through the steps to initialize a registry.')
	.option(
		'--build-script <name>',
		'The name of the build script. (For Registry setup)',
		'build:registry'
	)
	.option(
		'--publish-script <name>',
		'The name of the publish script. (For Registry setup)',
		'release:registry'
	)
	.option('-E, --expand', 'Expands the diff so you see the entire file.', false)
	.option(
		'--max-unchanged <number>',
		'Maximum unchanged lines that will show without being collapsed.',
		(val) => Number.parseInt(val), // this is such a dumb api thing
		3
	)
	.option('-y, --yes', 'Skip confirmation prompt.', false)
	.option('--no-cache', 'Disable caching of resolved git urls.')
	.option('--cwd <path>', 'The current working directory.', process.cwd())
	.action(async (registries, opts) => {
		const options = v.parse(schema, opts);

		await intro();

		if (options.registry !== undefined && options.project !== undefined) {
			program.error(
				color.red(
					`You cannot provide both ${color.bold('--project')} and ${color.bold('--registry')} at the same time.`
				)
			);
		}

		if (options.repos !== undefined) {
			log.warn(
				`The ${color.gray('`--repos`')} flag is deprecated! Instead supply registries as arguments. ${color.cyan(`\`jsrepo init ${options.repos.join(' ')}\``)}`
			);
		}

		if (
			options.registry === undefined &&
			options.project === undefined &&
			registries.length === 0
		) {
			const response = await select({
				message: 'Initialize a project or registry?',
				options: [
					{ value: 'project', label: 'project' },
					{ value: 'registry', label: 'registry' },
				],
				initialValue: 'project',
			});

			if (isCancel(response)) {
				cancel('Canceled!');
				process.exit(0);
			}

			options.project = response === 'project';
		}

		if (options.project || registries.length > 0) {
			await _initProject(registries, options);
		} else {
			await _initRegistry(options);
		}

		outro(color.green('All done!'));
	});

const _initProject = async (registries: string[], options: Options) => {
	const initialConfig = getProjectConfig(options.cwd);

	const loading = spinner();

	let paths: Paths;
	let configFiles: Record<string, string> = {};

	const tsconfigResult = tryGetTsconfig(options.cwd).unwrapOr(null);

	let defaultPath =
		options.paths?.['*'] ??
		(initialConfig.isOk() ? initialConfig.unwrap().paths['*'] : undefined);

	if (options.yes && defaultPath === undefined) {
		program.error(
			color.red('You must provide a default path to install the blocks when using --yes.')
		);
	}

	if (defaultPath === undefined) {
		const defaultPathResult = await text({
			message: 'Please enter a default path to install the blocks',
			validate(value) {
				if (value.trim() === '') return 'Please provide a value';

				if (!value.startsWith('./')) {
					const error =
						'Invalid path alias! If you are intending to use a relative path make sure it starts with `./`';

					if (tsconfigResult === null) {
						return error;
					}

					const matcher = createPathsMatcher(tsconfigResult);

					if (matcher) {
						const found = matcher(value);

						if (found.length === 0) return error;
					}
				}
			},
			placeholder: './src/blocks',
			initialValue: defaultPath,
		});

		if (isCancel(defaultPathResult)) {
			cancel('Canceled!');
			process.exit(0);
		}

		defaultPath = defaultPathResult;
	}

	if (initialConfig.isOk()) {
		paths = { ...initialConfig.unwrap().paths, '*': defaultPath };
		configFiles = initialConfig.unwrap().configFiles ?? {};
	} else {
		paths = { '*': defaultPath };
	}

	paths = { ...paths, ...options.paths };

	// configure formatter
	if (!options.formatter) {
		let defaultFormatter = initialConfig.isErr()
			? 'none'
			: (initialConfig.unwrap().formatter ?? 'none');

		if (fs.existsSync(path.join(options.cwd, '.prettierrc'))) {
			defaultFormatter = 'prettier';
		}

		if (fs.existsSync(path.join(options.cwd, 'biome.json'))) {
			defaultFormatter = 'biome';
		}

		const response = await select({
			message: 'Which formatter would you like to use?',
			options: ['Prettier', 'Biome', 'None'].map((val) => ({
				value: val.toLowerCase(),
				label: val,
			})),
			initialValue: defaultFormatter,
		});

		if (isCancel(response)) {
			cancel('Canceled!');
			process.exit(0);
		}

		if (response !== 'none') {
			options.formatter = response as Formatter;
		}
	}

	const repos = Array.from(
		new CaseInsensitiveSet([
			...registries,
			...(options.repos ?? []),
			...(initialConfig.isOk() ? initialConfig.unwrap().repos : []),
		])
	);

	const deps = new Set<string>();
	const devDeps = new Set<string>();

	const setupRepo = async (url: string) => {
		const promptResult = await promptForRegistryConfig({
			url,
			paths,
			configFiles,
			options,
			formatter: options.formatter,
		});

		for (const dep of promptResult.dependencies) {
			deps.add(dep);
		}

		for (const dep of promptResult.devDependencies) {
			devDeps.add(dep);
		}

		paths = promptResult.paths;
		configFiles = promptResult.configFiles;
	};

	if (repos.length > 0) {
		for (const repo of repos) {
			// if already present in config ask if you would like to set it up
			if (
				!registries.find((r) => r === repo) &&
				initialConfig.isOk() &&
				initialConfig.unwrap().repos.find((r) => r === repo)
			) {
				const confirmResult = await confirm({
					message: `Initialize ${repo}?`,
					initialValue: options.yes,
				});

				if (isCancel(confirmResult)) {
					cancel('Canceled!');
					process.exit(0);
				}

				if (!confirmResult) continue;
			}

			log.info(`Initializing ${color.cyan(repo)}`);

			await setupRepo(repo);
		}
	}

	while (true) {
		if (!options.yes) {
			const confirmResult = await confirm({
				message: repos.length > 0 ? 'Add another repo?' : 'Add a repo?',
				initialValue: repos.length === 0, // default to yes for first repo
			});

			if (isCancel(confirmResult)) {
				cancel('Canceled!');
				process.exit(0);
			}

			if (!confirmResult) break;
		} else {
			break;
		}

		const result = await text({
			message: 'Where should we download the blocks from?',
			placeholder: 'github/ieedan/std',
			validate: (val) => {
				if (val.trim().length === 0) return 'Please provide a value';

				if (!registry.selectProvider(val)) {
					return `Invalid provider! Valid providers (${registry.providers.map((provider) => provider.name).join(', ')})`;
				}
			},
		});

		if (isCancel(result)) {
			cancel('Canceled!');
			process.exit(0);
		}

		await setupRepo(result);

		repos.push(result);
	}

	const config: ProjectConfig = {
		$schema: `https://unpkg.com/jsrepo@${packageJson.version}/schemas/project-config.json`,
		repos,
		includeTests:
			initialConfig.isOk() && options.tests === undefined
				? initialConfig.unwrap().includeTests
				: (options.tests ?? false),
		includeDocs:
			initialConfig.isOk() && options.docs === undefined
				? initialConfig.unwrap().includeDocs
				: (options.docs ?? false),
		watermark: options.watermark,
		formatter: options.formatter,
		configFiles,
		paths,
	};

	loading.start(`Writing config to \`${PROJECT_CONFIG_NAME}\``);

	const { prettierOptions, biomeOptions } = await loadFormatterConfig({
		formatter: config.formatter,
		cwd: options.cwd,
	});

	const configPath = path.join(options.cwd, PROJECT_CONFIG_NAME);

	const configContent = await json.format(JSON.stringify(config, null, '\t'), {
		biomeOptions,
		prettierOptions,
		filePath: configPath,
		formatter: config.formatter,
	});

	if (!fs.existsSync(options.cwd)) {
		fs.mkdirSync(options.cwd, { recursive: true });
	}

	fs.writeFileSync(configPath, configContent);

	loading.stop(`Wrote config to \`${PROJECT_CONFIG_NAME}\`.`);

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

		steps.push(`Add blocks with ${color.cyan('jsrepo add')}!`);

		const next = nextSteps(steps);

		process.stdout.write(next);
	}
};

async function promptForRegistryConfig({
	url,
	paths,
	configFiles,
	formatter,
	options,
}: {
	url: string;
	paths: Paths;
	configFiles: Record<string, string>;
	formatter: ProjectConfig['formatter'];
	options: Options;
}): Promise<{
	paths: Paths;
	configFiles: Record<string, string>;
	dependencies: string[];
	devDependencies: string[];
}> {
	const loading = spinner();

	const storage = new TokenManager();

	const provider = registry.selectProvider(url);

	if (!provider) {
		program.error(
			color.red(
				`Invalid provider! Valid providers (${registry.providers.map((provider) => provider.name).join(', ')})`
			)
		);
	}

	let tokenKey: string = provider.name;

	if (provider.name === registry.http.name) {
		const parsed = registry.http.parse(url, { fullyQualified: false });

		// this is safe since we had to parse the url earlier to get the provider
		const registryUrl = new URL(parsed.url);

		tokenKey = `http-${registryUrl.origin}`;
	}

	const token = storage.get(tokenKey);

	// don't ask if the provider is a custom domain
	if (!token && !options.yes) {
		const result = await confirm({
			message: 'Would you like to add an auth token?',
			initialValue: false,
		});

		if (isCancel(result)) {
			cancel('Canceled!');
			process.exit(0);
		}

		if (result) {
			const response = await password({
				message: 'Paste your token',
				validate(value) {
					if (value.trim() === '') return 'Please provide a value';
				},
			});

			if (isCancel(response)) {
				cancel('Canceled!');
				process.exit(0);
			}

			storage.set(tokenKey, response);
		}
	}

	loading.start(`Fetching manifest from ${color.cyan(url)}`);

	const providerState = (await registry.getProviderState(url, { noCache: !options.cache })).match(
		(v) => v,
		(err) => program.error(color.red(err))
	);

	const manifest = (await registry.fetchManifest(providerState)).match(
		(v) => v,
		(err) => program.error(color.red(err))
	);

	loading.stop(`Fetched manifest from ${color.cyan(url)}`);

	checkPreconditions(providerState, manifest, options.cwd);

	const dependencies: string[] = [];
	const devDependencies: string[] = [];

	// setup config files
	if (manifest.configFiles) {
		const { prettierOptions, biomeOptions } = await loadFormatterConfig({
			formatter: formatter,
			cwd: options.cwd,
		});

		for (const file of manifest.configFiles) {
			if (file.optional && !options.yes) {
				const result = await confirm({
					message: `Would you like to add the ${file.name} file?`,
					initialValue: true,
				});

				if (isCancel(result)) {
					cancel('Canceled!');
					process.exit(0);
				}

				if (!result) continue;
			}

			dependencies.push(...(file.dependencies ?? []));
			devDependencies.push(...(file.devDependencies ?? []));

			// get the path to the file from the user
			if (!configFiles[file.name]) {
				if (options.configFiles?.[file.name]) {
					configFiles[file.name] = options.configFiles[file.name];
				} else if (!options.yes) {
					const result = await text({
						message: `Where is your ${file.name} file?`,
						defaultValue: file.expectedPath,
						initialValue: file.expectedPath,
						placeholder: file.expectedPath,
						validate(value) {
							if (value.trim() === '') return 'Please provide a value';
						},
					});

					if (isCancel(result)) {
						cancel('Canceled!');
						process.exit(0);
					}

					configFiles[file.name] = result;
				} else {
					if (!file.expectedPath) {
						program.error(
							color.red(`You must provide a path for ${file.name} when using --yes!`)
						);
					}

					configFiles[file.name] = file.expectedPath;
				}
			}

			let fullFilePath = path.join(options.cwd, configFiles[file.name]);

			let fileContents: string | undefined;

			if (fs.existsSync(fullFilePath)) {
				fileContents = fs.readFileSync(fullFilePath).toString();
			} else {
				const dir = path.dirname(fullFilePath);

				if (fs.existsSync(dir)) {
					const matchedPath = matchJSDescendant(fullFilePath);

					if (matchedPath) {
						fileContents = fs.readFileSync(matchedPath).toString();

						const newPath = path.relative(options.cwd, matchedPath);

						log.warn(
							`Located ${color.bold(configFiles[file.name])} at ${color.bold(newPath)}`
						);

						// update path
						configFiles[file.name] = newPath;

						fullFilePath = path.join(options.cwd, newPath);
					}
				}
			}

			loading.start(`Fetching the ${color.cyan(file.name)} from ${color.cyan(url)}`);

			const remoteContent = (await registry.fetchRaw(providerState, file.path)).match(
				(v) => v,
				(err) => program.error(color.red(err))
			);

			const originalRemoteContent = await formatFile({
				file: {
					content: remoteContent,
					destPath: fullFilePath,
				},
				biomeOptions,
				prettierOptions,
				formatter,
			});

			loading.stop(`Fetched the ${color.cyan(file.name)} from ${color.cyan(url)}`);

			let acceptedChanges = options.yes || fileContents === undefined;

			if (fileContents) {
				if (!options.yes) {
					const from = u.join(providerState.url, file.name);

					const updateResult = await promptUpdateFile({
						config: { biomeOptions, prettierOptions, formatter },
						current: {
							content: fileContents,
							path: fullFilePath,
						},
						incoming: {
							content: originalRemoteContent,
							path: from,
						},
						options: {
							...options,
							loading,
							no: false,
						},
					});

					if (updateResult.applyChanges) {
						acceptedChanges = true;
						fileContents = updateResult.updatedContent;
					}
				}
			} else {
				const dir = path.dirname(fullFilePath);

				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}

				fileContents = originalRemoteContent;
			}

			if (acceptedChanges && fileContents) {
				loading.start(`Writing ${color.cyan(file.name)} to ${color.cyan(fullFilePath)}`);

				fs.writeFileSync(fullFilePath, fileContents);

				loading.stop(`Wrote ${color.cyan(file.name)} to ${color.cyan(fullFilePath)}`);
			}
		}
	}

	// configure category paths
	if (!options.yes) {
		const configurePaths = await multiselect({
			message: 'Which category paths would you like to configure?',
			options: manifest.categories.map((cat) => ({
				label: cat.name,
				value: cat.name,
				hint: manifest.defaultPaths?.[cat.name]
					? `Default: ${manifest.defaultPaths?.[cat.name]}`
					: undefined,
			})),
			required: false,
		});

		if (isCancel(configurePaths)) {
			cancel('Canceled!');
			process.exit(0);
		}

		if (configurePaths.length > 0) {
			for (const category of configurePaths) {
				const configuredValue = paths[category] ?? manifest.defaultPaths?.[category];

				const categoryPath = await text({
					message: `Where should ${category} be added in your project?`,
					validate(value) {
						if (value.trim() === '') return 'Please provide a value';
					},
					placeholder: configuredValue ? configuredValue : `./src/${category}`,
					defaultValue: configuredValue,
					initialValue: configuredValue,
				});

				if (isCancel(categoryPath)) {
					cancel('Canceled!');
					process.exit(0);
				}

				paths[category] = categoryPath;
			}
		}
	}

	// use the default path (if it exists) for any categories the user didn't configure
	for (const category of manifest.categories) {
		if (paths[category.name] !== undefined) continue;

		const defaultPath = manifest.defaultPaths?.[category.name];

		if (!defaultPath) continue;

		paths[category.name] = defaultPath;
	}

	return { paths, configFiles, dependencies, devDependencies };
}

const _initRegistry = async (options: Options) => {
	const loading = spinner();

	const packagePath = path.join(options.cwd, 'package.json');

	if (!fs.existsSync(packagePath)) {
		program.error(color.red(`Couldn't find your ${color.bold('package.json')}!`));
	}

	let config = getRegistryConfig(options.cwd).match(
		(val) => val,
		(err) => program.error(color.red(err))
	);

	if (!config) {
		config = {
			$schema: '',
			name: undefined,
			version: undefined,
			readme: 'README.md',
			dirs: [],
			doNotListBlocks: [],
			doNotListCategories: [],
			listBlocks: [],
			listCategories: [],
			excludeDeps: [],
			includeBlocks: [],
			includeCategories: [],
			excludeBlocks: [],
			excludeCategories: [],
			preview: false,
			includeDocs: false,
		};
	}

	config.$schema = `https://unpkg.com/jsrepo@${packageJson.version}/schemas/registry-config.json`;

	while (true) {
		if (config.dirs.length > 0) {
			const confirmResult = await confirm({
				message: 'Add another blocks directory?',
				initialValue: false,
			});

			if (isCancel(confirmResult)) {
				cancel('Canceled!');
				process.exit(0);
			}

			if (!confirmResult) break;
		}

		const response = await text({
			message: 'Where are your blocks located?',
			placeholder: './src',
			defaultValue: './src',
			initialValue: './src',
			validate: (val) => {
				if (val.trim().length === 0) return 'Please provide a value!';
			},
		});

		if (isCancel(response)) {
			cancel('Canceled!');
			process.exit(0);
		}

		config.dirs.push(response);
	}

	const pkg = JSON.parse(fs.readFileSync(packagePath).toString());

	let configurePublish = !options.yes;

	if (!options.yes) {
		const confirmResult = await confirm({
			message: `Configure to publish to ${ascii.JSREPO_DOT_COM}?`,
			initialValue: true,
		});

		if (isCancel(confirmResult)) {
			cancel('Canceled!');
			process.exit(0);
		}

		configurePublish = confirmResult;
	}

	if (configurePublish) {
		if (!config.name) {
			const nameResponse = await text({
				message: "What's the name of your registry?",
				placeholder: '@ieedan/std',
				validate: (val) => {
					if (val.trim().length === 0) return 'Please provide a value!';
				},
			});

			if (isCancel(nameResponse)) {
				cancel('Canceled!');
				process.exit(0);
			}

			config.name = nameResponse;
		}

		if (!config.version) {
			config.version = '0.0.1';
		}

		options.publishScript = await promptForScriptKey(
			options.publishScript,
			pkg,
			options,
			'release:registry'
		);
	} else {
		options.buildScript = await promptForScriptKey(
			options.buildScript,
			pkg,
			options,
			'build:registry'
		);
	}

	const alreadyInstalled = pkg.devDependencies && pkg.devDependencies.jsrepo !== undefined;

	const pm = (await detect({ cwd: 'cwd' }))?.agent ?? 'npm';

	const buildScript = 'jsrepo build';
	const publishScript = 'jsrepo publish';

	// ensure we are adding to an object that exists
	if (pkg.scripts === undefined) {
		pkg.scripts = {};
	}

	if (configurePublish) {
		pkg.scripts[options.publishScript] = publishScript;
	} else {
		pkg.scripts[options.buildScript] = buildScript;
	}

	const tasks: Task[] = [];

	tasks.push({
		loadingMessage: 'Adding script to package.json',
		completedMessage: 'Added script to package.json',
		run: async () => {
			try {
				fs.writeFileSync(packagePath, JSON.stringify(pkg, null, '\t'));
			} catch (err) {
				program.error(
					color.red(`Error writing to \`${color.bold(packagePath)}\`. Error: ${err}`)
				);
			}
		},
	});

	tasks.push({
		loadingMessage: `Writing config to \`${color.cyan(REGISTRY_CONFIG_NAME)}\``,
		completedMessage: `Wrote config to \`${color.cyan(REGISTRY_CONFIG_NAME)}\``,
		run: async () => {
			const configPath = path.join(options.cwd, REGISTRY_CONFIG_NAME);

			try {
				fs.writeFileSync(path.join(configPath), JSON.stringify(config, null, '\t'));
			} catch (err) {
				program.error(
					color.red(`Error writing to \`${color.bold(configPath)}\`. Error: ${err}`)
				);
			}
		},
	});

	await runTasks(tasks, { loading });

	let installed = alreadyInstalled;

	if (!alreadyInstalled) {
		const installedResult = await promptInstallDependencies(new Set(), new Set(['jsrepo']), {
			cwd: options.cwd,
			pm,
			yes: options.yes,
		});

		installed = installedResult.installed;
	}

	let steps: string[] = [];

	if (!installed) {
		const cmd = resolveCommand(pm, 'add', ['jsrepo', '-D']);

		steps.push(
			`Install ${ascii.JSREPO} as a dev dependency \`${color.cyan(`${cmd?.command} ${cmd?.args.join(' ')}`)}\``
		);
	}

	steps.push(`Add categories to \`${color.cyan(config.dirs.join(', '))}\`.`);

	if (configurePublish) {
		const runScript = resolveCommand(pm, 'run', [options.publishScript]);

		steps.push(
			`Run \`${color.cyan(`${runScript?.command} ${runScript?.args.join(' ')}`)}\` to publish the registry.`
		);
	} else {
		const runScript = resolveCommand(pm, 'run', [options.buildScript]);

		steps.push(
			`Run \`${color.cyan(`${runScript?.command} ${runScript?.args.join(' ')}`)}\` to build the registry.`
		);
	}

	// put steps with numbers above here
	steps = steps.map((step, i) => `${i + 1}. ${step}`);

	const next = nextSteps(steps);

	process.stdout.write(next);
};

async function promptForScriptKey(
	scriptKey: string,
	pkg: PackageJson,
	options: Options,
	placeholder: string
) {
	let key = scriptKey;

	// continue asking until the user either chooses to overwrite or inputs a script that doesn't exist yet
	while (!options.yes && pkg.scripts && pkg.scripts[key]) {
		const response = await confirm({
			message: `The \`${color.cyan(key)}\` already exists overwrite?`,
			initialValue: false,
		});

		if (isCancel(response)) {
			cancel('Canceled!');
			process.exit(0);
		}

		if (!response) {
			const response = await text({
				message: 'What would you like to call the script?',
				placeholder,
				validate: (val) => {
					if (val.trim().length === 0) return 'Please provide a value!';
				},
			});

			if (isCancel(response)) {
				cancel('Canceled!');
				process.exit(0);
			}

			key = response;
		} else {
			break;
		}
	}

	return key;
}

export { init };
