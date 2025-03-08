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
import * as url from '../utils/blocks/ts/url';
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
import { installDependencies } from '../utils/dependencies';
import { formatFile, matchJSDescendant, tryGetTsconfig } from '../utils/files';
import { loadFormatterConfig } from '../utils/format';
import { json } from '../utils/language-support';
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
import { generateKeyPair, saveRegistryKeys } from '../utils/crypto';

const schema = v.object({
	repos: v.optional(v.array(v.string())),
	watermark: v.boolean(),
	tests: v.optional(v.boolean()),
	formatter: v.optional(formatterSchema),
	project: v.optional(v.boolean()),
	registry: v.optional(v.boolean()),
	script: v.string(),
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
	.addOption(
		new Option(
			'--formatter <formatter>',
			'What formatter to use when adding or updating blocks.'
		).choices(['prettier', 'biome'])
	)
	.option('-P, --project', 'Takes you through the steps to initialize a project.')
	.option('-R, --registry', 'Takes you through the steps to initialize a registry.')
	.option(
		'--script <name>',
		'The name of the build script. (For Registry setup)',
		'build:registry'
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
		initialValue: initialConfig.isOk() ? initialConfig.unwrap().paths['*'] : undefined,
	});

	if (isCancel(defaultPathResult)) {
		cancel('Canceled!');
		process.exit(0);
	}

	if (initialConfig.isOk()) {
		paths = { ...initialConfig.unwrap().paths, '*': defaultPathResult };
		configFiles = initialConfig.unwrap().configFiles ?? {};
	} else {
		paths = { '*': defaultPathResult };
	}

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
		new Set([
			...registries,
			...(options.repos ?? []),
			...(initialConfig.isOk() ? initialConfig.unwrap().repos : []),
		])
	);

	const deps = new Set<string>();
	const devDeps = new Set<string>();

	const setupRepo = async (repo: string) => {
		const promptResult = await promptForProviderConfig({
			repo,
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
		const confirmResult = await confirm({
			message: `Add ${repos.length > 0 ? 'another' : 'a'} repo?`,
			initialValue: repos.length === 0, // default to yes for first repo
		});

		if (isCancel(confirmResult)) {
			cancel('Canceled!');
			process.exit(0);
		}

		if (!confirmResult) break;

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

const promptForProviderConfig = async ({
	repo,
	paths,
	configFiles,
	formatter,
	options,
}: {
	repo: string;
	paths: Paths;
	configFiles: Record<string, string>;
	formatter: ProjectConfig['formatter'];
	options: Options;
}): Promise<{
	paths: Paths;
	configFiles: Record<string, string>;
	dependencies: string[];
	devDependencies: string[];
}> => {
	const loading = spinner();

	const storage = new TokenManager();

	const provider = registry.selectProvider(repo);

	if (!provider) {
		program.error(
			color.red(
				`Invalid provider! Valid providers (${registry.providers.map((provider) => provider.name).join(', ')})`
			)
		);
	}

	const token = storage.get(provider.name);

	// don't ask if the provider is a custom domain
	if (!token && provider.name !== registry.http.name && !options.yes) {
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

			storage.set(provider.name, response);
		}
	}

	loading.start(`Fetching manifest from ${color.cyan(repo)}`);

	const providerState = (
		await registry.getProviderState(repo, { noCache: !options.cache })
	).match(
		(v) => v,
		(err) => program.error(color.red(err))
	);

	const manifest = (await registry.fetchManifest(providerState)).match(
		(v) => v,
		(err) => program.error(color.red(err))
	);

	loading.stop(`Fetched manifest from ${color.cyan(repo)}`);

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

			loading.start(`Fetching the ${color.cyan(file.name)} from ${color.cyan(repo)}`);

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

			loading.stop(`Fetched the ${color.cyan(file.name)} from ${color.cyan(repo)}`);

			let acceptedChanges = options.yes || fileContents === undefined;

			if (fileContents) {
				if (!options.yes) {
					const from = url.join(providerState.url, file.name);

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
			options: manifest.categories.map((cat) => ({ label: cat.name, value: cat.name })),
			required: false,
		});

		if (isCancel(configurePaths)) {
			cancel('Canceled!');
			process.exit(0);
		}

		if (configurePaths.length > 0) {
			for (const category of configurePaths) {
				const configuredValue = paths[category];

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

	return { paths, configFiles, dependencies, devDependencies };
};

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

	const noConfig = config === null;

	if (!config) {
		config = {
			$schema: '',
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
			secure: false,
		};
	}

	if (!options.yes) {
		const secureResponse = await confirm({
			message: 'Would you like to create a secure registry?',
			initialValue: config.secure ?? false,
		});

		if (isCancel(secureResponse)) {
			cancel('Canceled!');
			process.exit(0);
		}

		config.secure = secureResponse;

		if (config.secure) {
			const repoUrlResponse = await text({
				message: 'What is the repository URL for this registry?',
				validate(value) {
					if (value.trim() === '') return 'Please provide a value';
					if (!value.startsWith('http')) return 'Please provide a valid URL';
				},
			});

			if (isCancel(repoUrlResponse)) {
				cancel('Canceled!');
				process.exit(0);
			}

			config.repoUrl = repoUrlResponse;

			const keyPathResponse = await text({
				message: 'Public key URL',
				validate(value) {
					if (value.trim() === '') return './.jsrepo/public.pem';
				},
			});

			if (isCancel(keyPathResponse)) {
				cancel('Canceled!');
				process.exit(0);
			}

			config.meta = {
				publicKeyUrl: keyPathResponse,
			};

			loading.start('Generating registry keys');
			const keyPair = await generateKeyPair();
			saveRegistryKeys(keyPair, options.cwd);
			loading.stop('Generated registry keys');

			if (config.secure) {
				const { publicKey, privateKey } = await generateKeyPair();
				const keys = saveRegistryKeys({ publicKey, privateKey }, options.cwd);

				log.info(color.cyan('Generated registry keys for secure mode.'));
				log.info(
					`You ca find your key pair at ${color.cyan(keys.publicKey)} and ${color.cyan(
						keys.privateKey
					)}`
				);
				log.info(color.yellow('IMPORTANT: For secure repositories, you must:'));
				log.info(`1. Create your first build: ${color.cyan('jsrepo build')}`);
				log.info(`2. Create an initial git tag: ${color.cyan('git tag 0.0.1')}`);
				log.info(`3. Push the tag: ${color.cyan('git push --tags')}`);
				log.info('This version tag is mandatory and will be verified during builds.');
			}

			loading.start(`Writing config to \`${REGISTRY_CONFIG_NAME}\``);

			const configPath = path.join(options.cwd, REGISTRY_CONFIG_NAME);

			try {
				fs.writeFileSync(path.join(configPath), JSON.stringify(config, null, '\t'));
			} catch (err) {
				program.error(
					color.red(`Error writing to \`${color.bold(configPath)}\`. Error: ${err}`)
				);
			} finally {
				loading.stop(`Wrote config to \`${REGISTRY_CONFIG_NAME}\``);
			}
		}
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

	// continue asking until the user either chooses to overwrite or inputs a script that doesn't exist yet
	while (!options.yes && pkg.scripts && pkg.scripts[options.script]) {
		const response = await confirm({
			message: `The \`${color.cyan(options.script)}\` already exists overwrite?`,
			initialValue: false,
		});

		if (isCancel(response)) {
			cancel('Canceled!');
			process.exit(0);
		}

		if (!response) {
			const response = await text({
				message: 'What would you like to call the script?',
				placeholder: 'build:registry',
				validate: (val) => {
					if (val.trim().length === 0) return 'Please provide a value!';
				},
			});

			if (isCancel(response)) {
				cancel('Canceled!');
				process.exit(0);
			}

			options.script = response;
		} else {
			break;
		}
	}

	const alreadyInstalled = pkg.devDependencies && pkg.devDependencies.jsrepo !== undefined;

	let installAsDevDependency = options.yes || alreadyInstalled;

	if (!options.yes && !alreadyInstalled) {
		const response = await confirm({
			message: `Add ${ascii.JSREPO} as a dev dependency?`,
			initialValue: true,
		});

		if (isCancel(response)) {
			cancel('Canceled!');
			process.exit(0);
		}

		installAsDevDependency = response;
	}

	let jsonConfig = !noConfig;

	if (!options.yes && noConfig) {
		const response = await confirm({
			message: `Create a \`${color.cyan(REGISTRY_CONFIG_NAME)}\` file?`,
			initialValue: true,
		});

		if (isCancel(response)) {
			cancel('Canceled!');
			process.exit(0);
		}

		jsonConfig = response;
	}

	const pm = (await detect({ cwd: 'cwd' }))?.agent ?? 'npm';

	let buildScript = '';

	if (installAsDevDependency) {
		buildScript += 'jsrepo build';
	} else {
		const command = resolveCommand(pm, 'execute', ['jsrepo', 'build']);

		if (!command) program.error(color.red(`Error resolving execute command for ${pm}`));

		buildScript += `${command.command} ${command.args.join(' ')} `;
	}

	// if we aren't using a config file configure the command with the correct flags
	if (!jsonConfig) {
		buildScript += ` --dirs ${config.dirs.join(' ')} `;
	}

	// ensure we are adding to an object that exists
	if (pkg.scripts === undefined) {
		pkg.scripts = {};
	}

	pkg.scripts[options.script] = buildScript;

	const tasks: Task[] = [];

	tasks.push({
		loadingMessage: `Adding \`${color.cyan(options.script)}\` to scripts in package.json`,
		completedMessage: `Added \`${color.cyan(options.script)}\` to scripts in package.json`,
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

	if (jsonConfig) {
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
	}

	await runTasks(tasks, { loading });

	let installed = alreadyInstalled;

	if (installAsDevDependency && !alreadyInstalled) {
		const installedResult = await promptInstallDependencies(new Set(), new Set(['jsrepo']), {
			cwd: options.cwd,
			pm,
			yes: options.yes,
		});

		installed = installedResult.installed;
	}

	let steps: string[] = [];

	if (!installed && installAsDevDependency) {
		const cmd = resolveCommand(pm, 'add', ['jsrepo', '-D']);

		steps.push(
			`Install ${ascii.JSREPO} as a dev dependency \`${color.cyan(`${cmd?.command} ${cmd?.args.join(' ')}`)}\``
		);
	}

	steps.push(`Add categories to \`${color.cyan(config.dirs.join(', '))}\`.`);

	const runScript = resolveCommand(pm, 'run', [options.script]);

	steps.push(
		`Run \`${color.cyan(`${runScript?.command} ${runScript?.args.join(' ')}`)}\` to build the registry.`
	);

	// put steps with numbers above here
	steps = steps.map((step, i) => `${i + 1}. ${step}`);

	const next = nextSteps(steps);

	process.stdout.write(next);
};

export { init };
