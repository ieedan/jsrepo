import fs from 'node:fs';
import color from 'chalk';
import { program } from 'commander';
import path from 'pathe';
import type { Block } from '../types';
import * as array from './blocks/ts/array';
import { Err, Ok, type Result } from './blocks/ts/result';
import * as url from './blocks/ts/url';
import { isTestFile } from './build';
import { type Paths, type ProjectConfig, getPathForBlock, resolvePaths } from './config';
import * as registry from './registry-providers/internal';

export const resolveTree = async (
	blockSpecifiers: string[],
	blocksMap: Map<string, registry.RemoteBlock>,
	repoPaths: registry.RegistryProviderState[],
	installed: Map<string, registry.RemoteBlock> = new Map()
): Promise<Result<registry.RemoteBlock[], string>> => {
	const blocks = new Map<string, registry.RemoteBlock>();

	for (const blockSpecifier of blockSpecifiers) {
		let block: registry.RemoteBlock | undefined = undefined;

		const provider = registry.selectProvider(blockSpecifier);

		// if the block starts with github (or another provider) we know it has been resolved
		if (!provider) {
			if (repoPaths.length === 0) {
				return Err(
					color.red(
						`If your config doesn't contain repos then you must provide the repo in the block specifier ex: \`${color.bold(
							`github/ieedan/std/${blockSpecifier}`
						)}\`!`
					)
				);
			}

			// check every repo for the block and return the first block found
			for (const providerState of repoPaths) {
				const { url: repoIdent, specifier } = providerState.provider.parse(
					url.join(providerState.url, blockSpecifier),
					{ fullyQualified: true }
				);

				const tempBlock = blocksMap.get(url.join(repoIdent, specifier!));

				if (tempBlock === undefined) continue;

				block = tempBlock;

				break;
			}
		} else {
			// get shortened name
			const { url: repoIdent, specifier } = provider.parse(blockSpecifier, {
				fullyQualified: true,
			});

			// just beautifies name a bit
			block = blocksMap.get(url.join(repoIdent, specifier!));
		}

		if (!block) {
			return Err(`Invalid block! ${color.bold(blockSpecifier)} does not exist!`);
		}

		const specifier = `${block.category}/${block.name}`;

		blocks.set(specifier, block);

		if (block.localDependencies && block.localDependencies.length > 0) {
			const subDeps = await resolveTree(
				block.localDependencies.filter((dep) => !blocks.has(dep) && !installed.has(dep)),
				blocksMap,
				repoPaths,
				blocks
			);

			if (subDeps.isErr()) return Err(subDeps.unwrapErr());

			for (const dep of subDeps.unwrap()) {
				blocks.set(`${dep.category}/${dep.name}`, dep);
			}
		}
	}

	return Ok(array.fromMap(blocks, (_, val) => val));
};

type InstalledBlock = {
	specifier: `${string}/${string}`;
	path: string;
	block: Block;
};

/** Finds installed blocks and returns them as `<category>/<name>`
 *
 * @param blocks
 * @param config
 * @returns
 */
export const getInstalled = (
	blocks: Map<string, Block>,
	config: ProjectConfig,
	cwd: string
): InstalledBlock[] => {
	const installedBlocks: InstalledBlock[] = [];

	const resolvedPaths = resolvePaths(config.paths, cwd).match(
		(v) => v,
		(err) => program.error(color.red(err))
	);

	for (const [_, block] of blocks) {
		const baseDir = getPathForBlock(block, resolvedPaths, cwd);

		let blockPath = path.join(baseDir, block.files[0]);
		if (block.subdirectory) {
			blockPath = path.join(baseDir, block.name);
		}

		if (fs.existsSync(blockPath))
			installedBlocks.push({
				specifier: `${block.category}/${block.name}`,
				path: blockPath,
				block,
			});
	}

	return installedBlocks;
};

export type RegistryFile = {
	name: string;
	content: Result<string, string>;
};

type PreloadedBlock = {
	block: registry.RemoteBlock;
	files: Promise<RegistryFile[]>;
};

/** Starts loading the content of the files for each block and
 * returns the blocks mapped to a promise that contains their files and their contents.
 *
 * @param blocks
 * @returns
 */
export const preloadBlocks = (
	blocks: registry.RemoteBlock[],
	config: ProjectConfig,
	{ verbose }: { verbose?: (msg: string) => void } = {}
): PreloadedBlock[] => {
	const preloaded: PreloadedBlock[] = [];

	for (const block of blocks) {
		// filters out test files if they are not supposed to be included
		const includedFiles = block.files.filter((file) =>
			isTestFile(file) ? config.includeTests : true
		);

		const files = Promise.all(
			includedFiles.map(async (file) => {
				const content = await registry.fetchRaw(
					block.sourceRepo,
					path.join(block.directory, file),
					{ verbose }
				);

				return { name: file, content };
			})
		);

		preloaded.push({
			block,
			files
		});
	}

	return preloaded;
};

/** Gets the path for the file belonging to the provided block
 *
 * @param fileName
 * @param block
 * @param resolvedPaths
 * @param cwd
 * @returns
 */
export const getBlockFilePath = (
	fileName: string,
	block: registry.RemoteBlock,
	resolvedPaths: Paths,
	cwd: string
) => {
	const directory = getPathForBlock(block, resolvedPaths, cwd);

	if (block.subdirectory) {
		return path.join(directory, block.name, fileName);
	}

	return path.join(directory, fileName);
};
