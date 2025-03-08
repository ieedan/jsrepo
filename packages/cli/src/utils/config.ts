import fs from 'node:fs';
import color from 'chalk';
import { createPathsMatcher } from 'get-tsconfig';
import path from 'pathe';
import * as v from 'valibot';
import { type Block, configFileSchema, manifestMeta, peerDependencySchema } from '../types';
import { Err, Ok, type Result } from './blocks/ts/result';
import { ruleConfigSchema } from './build/check';
import { tryGetTsconfig } from './files';

export const PROJECT_CONFIG_NAME = 'jsrepo.json';
export const REGISTRY_CONFIG_NAME = 'jsrepo-build-config.json';

export const formatterSchema = v.union([v.literal('prettier'), v.literal('biome')]);

export const pathsSchema = v.objectWithRest(
	{
		'*': v.string(),
	},
	v.string()
);

export type Paths = v.InferInput<typeof pathsSchema>;

export const projectConfigSchema = v.object({
	$schema: v.string(),
	repos: v.optional(v.array(v.string()), []),
	includeTests: v.boolean(),
	paths: pathsSchema,
	configFiles: v.optional(v.record(v.string(), v.string())),
	watermark: v.optional(v.boolean(), true),
	formatter: v.optional(formatterSchema),
});

export const getProjectConfig = (cwd: string): Result<ProjectConfig, string> => {
	if (!fs.existsSync(path.join(cwd, PROJECT_CONFIG_NAME))) {
		return Err('Could not find your configuration file! Please run `init`.');
	}

	const config = v.safeParse(
		projectConfigSchema,
		JSON.parse(fs.readFileSync(path.join(cwd, PROJECT_CONFIG_NAME)).toString())
	);

	if (!config.success) {
		return Err(`There was an error reading your \`${PROJECT_CONFIG_NAME}\` file!`);
	}

	return Ok(config.output);
};

export type ProjectConfig = v.InferOutput<typeof projectConfigSchema>;

export type Formatter = v.InferOutput<typeof formatterSchema>;

export const registryConfigSchema = v.object({
	$schema: v.string(),
	meta: v.optional(manifestMeta),
	peerDependencies: v.optional(peerDependencySchema),
	configFiles: v.optional(v.array(configFileSchema)),
	dirs: v.array(v.string()),
	outputDir: v.optional(v.string()),
	includeBlocks: v.optional(v.array(v.string()), []),
	includeCategories: v.optional(v.array(v.string()), []),
	excludeBlocks: v.optional(v.array(v.string()), []),
	excludeCategories: v.optional(v.array(v.string()), []),
	doNotListBlocks: v.optional(v.array(v.string()), []),
	doNotListCategories: v.optional(v.array(v.string()), []),
	listBlocks: v.optional(v.array(v.string()), []),
	listCategories: v.optional(v.array(v.string()), []),
	excludeDeps: v.optional(v.array(v.string()), []),
	allowSubdirectories: v.optional(v.boolean()),
	preview: v.optional(v.boolean()),
	rules: v.optional(ruleConfigSchema),
	secure: v.optional(v.boolean(), false),
	repoUrl: v.optional(v.string()),
});

export const getRegistryConfig = (cwd: string): Result<RegistryConfig | null, string> => {
	if (!fs.existsSync(path.join(cwd, REGISTRY_CONFIG_NAME))) {
		return Ok(null);
	}

	const config = v.safeParse(
		registryConfigSchema,
		JSON.parse(fs.readFileSync(path.join(cwd, REGISTRY_CONFIG_NAME)).toString())
	);

	if (!config.success) {
		return Err(`There was an error reading your \`${REGISTRY_CONFIG_NAME}\` file!`);
	}

	return Ok(config.output);
};

export type RegistryConfig = v.InferOutput<typeof registryConfigSchema>;

/** Resolves the paths relative to the cwd */
export const resolvePaths = (paths: Paths, cwd: string): Result<Paths, string> => {
	const config = tryGetTsconfig(cwd).unwrapOr(null);

	const matcher = config ? createPathsMatcher(config) : null;

	const newPaths: Paths = { '*': '' };

	for (const [category, p] of Object.entries(paths)) {
		if (p.startsWith('./')) {
			newPaths[category] = path.relative(cwd, path.join(path.resolve(cwd), p));
			continue;
		}

		if (matcher === null) {
			return Err(
				`Cannot resolve ${color.bold(`\`"${category}": "${p}"\``)} from paths because we couldn't find a tsconfig! If you intended to use a relative path ensure that your path starts with ${color.bold('`./`')}.`
			);
		}

		const resolved = tryResolvePath(p, matcher, cwd);

		if (!resolved) {
			return Err(
				`Cannot resolve ${color.bold(`\`"${category}": "${p}"\``)} from paths because we couldn't find a matching alias in the tsconfig. If you intended to use a relative path ensure that your path starts with ${color.bold('`./`')}.`
			);
		}

		newPaths[category] = resolved;
	}

	return Ok(newPaths);
};

const tryResolvePath = (
	unresolvedPath: string,
	matcher: (specifier: string) => string[],
	cwd: string
): string | undefined => {
	const paths = matcher(unresolvedPath);

	return paths.length > 0 ? path.relative(cwd, paths[0]) : undefined;
};

/** Gets the path where the block should be installed.
 *
 * @param block
 * @param resolvedPaths
 * @param cwd
 * @returns
 */
export const getPathForBlock = (block: Block, resolvedPaths: Paths, cwd: string): string => {
	let directory: string;

	if (resolvedPaths[block.category] !== undefined) {
		directory = path.join(cwd, resolvedPaths[block.category]);
	} else {
		directory = path.join(cwd, resolvedPaths['*'], block.category);
	}

	return directory;
};
