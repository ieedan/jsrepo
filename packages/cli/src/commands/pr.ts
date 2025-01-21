import { cancel, confirm, isCancel, outro, password, select, spinner } from '@clack/prompts';
import color from 'chalk';
import { Command, program } from 'commander';
import * as v from 'valibot';
import { context } from '../cli';
import * as ascii from '../utils/ascii';
import * as persisted from '../utils/persisted';
import { intro } from '../utils/prompts';
import { http, providers } from '../utils/providers';
import { getProjectConfig } from '../utils/config';

const schema = v.object({
	yes: v.boolean(),
	verbose: v.boolean(),
	cwd: v.string(),
});

type Options = v.InferInput<typeof schema>;

const gitProviders = providers.filter((p) => p.name() !== http.name());

const pr = new Command('pr')
	.description('Open a pull request to update a block in one of your repositories.')
	.argument(
		'block',
		'Fully qualified name of the block you want to PR. ex: (github/ieedan/std/utils/math)'
	)
	.option('-y, --yes', 'Skip confirmation prompt.', false)
	.option('--verbose', 'Include debug logs.', false)
	.option('--cwd <path>', 'The current working directory.', process.cwd())
	.action(async (block, opts) => {
		const options = v.parse(schema, opts);

		intro(context);

		await _pr(block, options);

		outro(color.green('All done!'));
	});

const _pr = async (block: string, options: Options) => {
	const verbose = (msg: string) => {
		if (options.verbose) {
			console.info(`${ascii.INFO} ${msg}`);
		}
	};

	const loading = spinner();

	const config = getProjectConfig(options.cwd).match(
		(val) => val,
		(err) => program.error(color.red(err))
	);

	const provider = gitProviders.find((p) => block.startsWith(p.name()));

	if (!provider) {
		if (block.startsWith('http')) {
			program.error(
				color.red(
					`Only supported git repositories can be used for this command. ${gitProviders.map((p) => color.bold(p.name())).join(', ')}`
				)
			);
		}

		program.error(
			color.red(
				'Blocks must be fully qualified to ensure you are updating the expected repository.'
			)
		);
	}

	const [repo, specifier] = provider.parseBlockSpecifier(block);
};

export { pr };
