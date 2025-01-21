import { cancel, confirm, isCancel, outro, password, select } from '@clack/prompts';
import color from 'chalk';
import { Command, Option } from 'commander';
import * as v from 'valibot';
import { context } from '../cli';
import * as ascii from '../utils/ascii';
import * as persisted from '../utils/persisted';
import { intro } from '../utils/prompts';
import { http, providers } from '../utils/providers';

const schema = v.object({
	token: v.optional(v.string()),
	provider: v.optional(v.string()),
	logout: v.boolean(),
});

type Options = v.InferInput<typeof schema>;

const gitProviders = providers.filter((p) => p.name() !== http.name());

const auth = new Command('auth')
	.description('Provide a token for access to private repositories.')
	.option('--token <token>', 'The token to use for authenticating to your provider.')
	.addOption(
		new Option('--provider <name>', 'The provider this token belongs to.').choices(
			gitProviders.map((provider) => provider.name())
		)
	)
	.option('--logout', 'Erase tokens from each provider from storage.', false)
	.action(async (opts) => {
		const options = v.parse(schema, opts);

		intro(context);

		await _auth(options);

		outro(color.green('All done!'));
	});

const _auth = async (options: Options) => {
	const storage = persisted.get();

	if (options.logout) {
		for (const provider of gitProviders) {
			const tokenKey = `${provider.name()}-token`;

			if (storage.get(tokenKey) === undefined) {
				process.stdout.write(`${ascii.VERTICAL_LINE}\n`);
				process.stdout.write(
					color.gray(
						`${ascii.VERTICAL_LINE}  Already logged out of ${provider.name()}.\n`
					)
				);
				continue;
			}

			const response = await confirm({
				message: `Remove ${provider.name()} token?`,
				initialValue: true,
			});

			if (isCancel(response)) {
				cancel('Canceled!');
				process.exit(0);
			}

			if (!response) continue;

			storage.delete(tokenKey);
		}
		return;
	}

	if (gitProviders.length > 1) {
		const response = await select({
			message: 'Which provider is this token for?',
			options: gitProviders.map((provider) => ({
				label: provider.name(),
				value: provider.name(),
			})),
			initialValue: gitProviders[0].name(),
		});

		if (isCancel(response)) {
			cancel('Canceled!');
			process.exit(0);
		}

		options.provider = response;
	} else {
		options.provider = gitProviders[0].name();
	}

	if (options.token === undefined) {
		const response = await password({
			message: 'Paste your token',
			validate(value) {
				if (value.trim() === '') return 'Please provide a value';
			},
		});

		if (isCancel(response) || !response) {
			cancel('Canceled!');
			process.exit(0);
		}

		options.token = response;
	}

	storage.set(`${options.provider}-token`, options.token);
};

export { auth };
