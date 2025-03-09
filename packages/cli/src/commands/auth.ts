import { cancel, confirm, isCancel, log, outro, password, select } from '@clack/prompts';
import color from 'chalk';
import { Argument, Command, program } from 'commander';
import * as v from 'valibot';
import { intro } from '../utils/prompts';
import { TokenManager } from '../utils/token-manager';
import { getProjectConfig } from '../utils/config';
import { http } from '../utils/registry-providers/http';

const schema = v.object({
	token: v.optional(v.string()),
	logout: v.boolean(),
	cwd: v.string()
});

type Options = v.InferInput<typeof schema>;

const services = ['Anthropic', 'Azure', 'BitBucket', 'GitHub', 'GitLab', 'OpenAI', 'HTTP'].sort();

const auth = new Command('auth')
	.description('Provide a token for access to private repositories.')
	.addArgument(
		new Argument('service', 'The service you want to authenticate to.')
			.choices(services.map((s) => s.toLowerCase()))
			.argOptional()
	)
	.addArgument(
		new Argument(
			'url',
			'The URL of the HTTP provider you want to authenticate to. Must be one from `repos` in `jsrepo.json`.'
		).argOptional()
	)
	.option('--logout', 'Execute the logout flow.', false)
	.option('--token <token>', 'The token to use for authenticating to this service.')
	.option('--cwd <path>', 'The current working directory.', process.cwd())
	.action(async (service, url, opts) => {
		const options = v.parse(schema, opts);

		await intro();

		await _auth(service, url, options);

		outro(color.green('All done!'));
	});

const _auth = async (service: string | undefined, url: string | undefined, options: Options) => {
	let selectedService = services.find((s) => s.toLowerCase() === service?.toLowerCase());

	const configResult = getProjectConfig(options.cwd);
	if (selectedService?.toLowerCase() === 'http') {
		if (configResult.isErr()) {
			log.error(color.red('Could not find a config file.'));
			return;
		}
	}
	const config = configResult.unwrap();
	const httpProviders = config.repos.filter((repoUrl) => http.matches(repoUrl));

	// If the user wants to authenticate to HTTP, we need to get the URL from the config file
	if (selectedService?.toLowerCase() === 'http') {
		// If the user provided a URL, use that, but check if it's valid and exists in the config file
		selectedService =
			httpProviders.find((repoUrl) => repoUrl === url) ??
			(await getSelectedHTTPService(httpProviders));
	}

	const storage = new TokenManager();

	if (options.logout) {
		if (selectedService !== undefined) {
			const storageKey = http.matches(selectedService)
				? http.keys.token(selectedService)
				: selectedService;
			storage.delete(storageKey);
			log.success(`Logged out of ${selectedService}.`);
			return;
		}

		for (const serviceName of [...services, ...httpProviders]) {
			if (storage.get(serviceName) === undefined) {
				log.step(color.gray(`Already logged out of ${serviceName}.`));
				continue;
			}

			const response = await confirm({
				message: `Logout of ${serviceName}?`,
				initialValue: true
			});

			if (isCancel(response)) {
				cancel('Canceled!');
				process.exit(0);
			}

			if (!response) continue;

			const storageKey = http.matches(serviceName) ? http.keys.token(serviceName) : serviceName;
			storage.delete(storageKey);
		}
		return;
	}

	if (selectedService === undefined) {
		const response = await select({
			message: 'Which service do you want to authenticate to?',
			options: [...services.filter((s) => s.toLowerCase() !== 'http'), ...httpProviders].map(
				(serviceName) => ({
					label: serviceName,
					value: serviceName
				})
			),
			initialValue: [...services.filter((s) => s.toLowerCase() !== 'http'), ...httpProviders][0]
		});

		if (isCancel(response)) {
			cancel('Canceled!');
			process.exit(0);
		}

		selectedService = response;
	}

	if (options.token === undefined) {
		const response = await password({
			message: `Paste your ${color.bold(selectedService)} token:`,
			validate(value) {
				if (value.trim() === '') return 'Please provide a value';
			}
		});

		if (isCancel(response) || !response) {
			cancel('Canceled!');
			process.exit(0);
		}

		options.token = response;
	}

	const storageKey = http.matches(selectedService)
		? http.keys.token(selectedService)
		: selectedService;
	storage.set(storageKey, options.token);

	log.success(`Logged into ${selectedService}.`);
};

export { auth };

async function getSelectedHTTPService(httpProviders: string[]) {
	const response = await select({
		message: 'What URL would you like to use?',
		options: httpProviders.map((repoUrl) => ({
			value: repoUrl,
			label: repoUrl
		})),
		initialValue: httpProviders[0]
	});

	if (isCancel(response)) {
		cancel('Canceled!');
		process.exit(0);
	}
	return response;
}
