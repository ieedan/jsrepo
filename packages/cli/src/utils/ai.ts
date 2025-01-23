import Anthropic from '@anthropic-ai/sdk';
import { cancel, isCancel, password, type spinner } from '@clack/prompts';
import ollama from 'ollama';
import OpenAI from 'openai';
import * as lines from './blocks/utils/lines';
import * as persisted from './persisted';

type File = {
	path: string;
	content: string;
};

export interface Model {
	updateFile: (opts: {
		originalFile: File;
		newFile: File;
		loading: ReturnType<typeof spinner>;
		verbose?: (msg: string) => void;
	}) => Promise<string>;
}

export type ModelName =
	| 'Claude 3.5 Sonnet'
	| 'ChatGPT 4o-mini'
	| 'ChatGPT 4o'
	| 'Phi4'
	| 'DeepSeek Coder v2';

type Prompt = {
	system: string;
	message: string;
};

const models: Record<ModelName, Model> = {
	'Claude 3.5 Sonnet': {
		updateFile: async ({ originalFile, newFile, loading, verbose }) => {
			const apiKey = await getApiKey('Anthropic');

			if (!verbose) loading.start(`Asking ${'Claude 3.5 Sonnet'}`);

			const prompt = createUpdatePrompt({ originalFile, newFile });

			verbose?.(
				`Prompting ${'Claude 3.5 Sonnet'} with:\n${JSON.stringify(prompt, null, '\t')}`
			);

			const text = await getNextCompletionAnthropic({
				model: 'claude-3-5-sonnet-latest',
				prompt,
				apiKey,
				maxTokens: (originalFile.content.length + newFile.content.length) * 2,
			});

			if (!verbose) loading.stop(`${'Claude 3.5 Sonnet'} updated the file`);

			if (!text) return newFile.content;

			return unwrapCodeFromQuotes(text);
		},
	},
	'ChatGPT 4o': {
		updateFile: async ({ originalFile, newFile, loading, verbose }) => {
			const apiKey = await getApiKey('OpenAI');

			if (!verbose) loading.start(`Asking ${'ChatGPT 4o'}`);

			const prompt = createUpdatePrompt({ originalFile, newFile });

			verbose?.(`Prompting ${'ChatGPT 4o'} with:\n${JSON.stringify(prompt, null, '\t')}`);

			const text = await getNextCompletionOpenAI({
				model: 'gpt-4o',
				prompt,
				apiKey,
				maxTokens: (originalFile.content.length + newFile.content.length) * 2,
			});

			if (!verbose) loading.stop(`${'ChatGPT 4o'} updated the file`);

			if (!text) return newFile.content;

			return unwrapCodeFromQuotes(text);
		},
	},
	'ChatGPT 4o-mini': {
		updateFile: async ({ originalFile, newFile, loading, verbose }) => {
			const apiKey = await getApiKey('OpenAI');

			if (!verbose) loading.start(`Asking ${'ChatGPT 4o-mini'}`);

			const prompt = createUpdatePrompt({ originalFile, newFile });

			verbose?.(`Prompting ${'ChatGPT 4o'} with:\n${JSON.stringify(prompt, null, '\t')}`);

			const text = await getNextCompletionOpenAI({
				model: 'gpt-4o-mini',
				prompt,
				apiKey,
				maxTokens: (originalFile.content.length + newFile.content.length) * 2,
			});

			if (!verbose) loading.stop(`${'ChatGPT 4o-mini'} updated the file`);

			if (!text) return newFile.content;

			return unwrapCodeFromQuotes(text);
		},
	},
	Phi4: {
		updateFile: async ({ originalFile, newFile, loading, verbose }) => {
			if (!verbose) loading.start(`Asking ${'Phi4'}`);

			const prompt = createUpdatePrompt({ originalFile, newFile });

			verbose?.(`Prompting ${'Phi4'} with:\n${JSON.stringify(prompt, null, '\t')}`);

			const text = await getNextCompletionOllama({ model: 'phi4', prompt });

			if (!verbose) loading.stop(`${'Phi4'} updated the file`);

			if (!text) return newFile.content;

			return unwrapCodeFromQuotes(text);
		},
	},
	'DeepSeek Coder v2': {
		updateFile: async ({ originalFile, newFile, loading, verbose }) => {
			if (!verbose) loading.start(`Asking ${'DeepSeek Coder v2'}`);

			const prompt = createUpdatePrompt({ originalFile, newFile });

			verbose?.(
				`Prompting ${'DeepSeek Coder v2'} with:\n${JSON.stringify(prompt, null, '\t')}`
			);

			const text = await getNextCompletionOllama({ model: 'deepseek-coder-v2', prompt });

			if (!verbose) loading.stop(`${'DeepSeek Coder v2'} updated the file`);

			if (!text) return newFile.content;

			return unwrapCodeFromQuotes(text);
		},
	},
};

const getNextCompletionOpenAI = async ({
	prompt,
	maxTokens,
	model,
	apiKey,
}: {
	prompt: Prompt;
	maxTokens: number;
	model: OpenAI.Chat.ChatModel;
	apiKey: string;
}): Promise<string | null> => {
	const openai = new OpenAI({ apiKey });

	const msg = await openai.chat.completions.create({
		model,
		max_completion_tokens: maxTokens,
		messages: [
			{
				role: 'system',
				content: prompt.system,
			},
			{
				role: 'user',
				content: prompt.message,
			},
		],
	});

	const first = msg.choices[0];

	if (first.message.content === null) return null;

	return first.message.content;
};

const getNextCompletionAnthropic = async ({
	prompt,
	maxTokens,
	model,
	apiKey,
}: {
	prompt: Prompt;
	maxTokens: number;
	model: Anthropic.Messages.Model;
	apiKey: string;
}): Promise<string | null> => {
	const anthropic = new Anthropic({ apiKey });

	const msg = await anthropic.messages.create({
		model,
		max_tokens: Math.min(maxTokens, 8192),
		temperature: 0.5,
		system: prompt.system,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: prompt.message,
					},
				],
			},
		],
	});

	const first = msg.content[0];

	// if we don't get it in the format you want just return the new file
	if (first.type !== 'text') return null;

	return first.text;
};

const getNextCompletionOllama = async ({
	prompt,
	model,
}: {
	prompt: Prompt;
	model: string;
}): Promise<string | null> => {
	const resp = await ollama.generate({
		model,
		system: prompt.system,
		prompt: prompt.message,
	});

	return resp.response;
};

const createUpdatePrompt = ({
	originalFile,
	newFile,
}: { originalFile: File; newFile: File }): Prompt => {
	return {
		system: 'You will respond only with the resulting code. DO NOT format the code with markdown, DO NOT put the code inside of triple quotes, only return the code as a raw string.',
		message: `Help me merge these two files. DO NOT make unnecessary changes. 
I expect the original code to maintain the same behavior as it currently has while including any added functionality from the new file.
This means stuff like defaults or configuration should normally stay intact unless the new behaviors in the new file depend on those defaults or configuration.
This is my current file ${originalFile.path}:
\`\`\`
${originalFile.content}
\`\`\`
	
This is the file that has changes I want to update with ${newFile.path}:
\`\`\`
${newFile.content}
\`\`\`
	`,
	};
};

/** The AI isn't always that smart and likes to wrap the code in quotes even though I beg it not to.
 *  This function attempts to remove the quotes.
 */
export const unwrapCodeFromQuotes = (quoted: string): string => {
	let code = quoted.trim();

	if (code.startsWith('```')) {
		// takes out the entire first line
		// this is because often a language will come after the triple quotes
		code = lines.get(code).slice(1).join('\n').trim();
	}

	if (code.endsWith('```')) {
		const l = lines.get(code);
		code = l
			.slice(0, l.length - 1)
			.join('\n')
			.trim();
	}

	return code;
};

/** Attempts to get the cached api key if it can't it will prompt the user
 *
 * @param name
 * @returns
 */
const getApiKey = async (name: 'OpenAI' | 'Anthropic'): Promise<string> => {
	const KEY = `${name}-api-key`;

	const storage = persisted.get();

	let apiKey = storage.get(KEY, null) as string | null;

	if (!apiKey) {
		// prompt for api key
		const result = await password({
			message: `Paste your ${name} API key:`,
			validate(value) {
				if (value.trim() === '') return 'Please provide an API key';
			},
		});

		if (isCancel(result) || !result) {
			cancel('Canceled!');
			process.exit(0);
		}

		apiKey = result;
	}

	storage.set(KEY, apiKey);

	return apiKey;
};

export { models };
