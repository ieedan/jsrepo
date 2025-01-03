import { intro, spinner } from '@clack/prompts';
import color from 'chalk';
import * as ascii from './ascii';
import { rightPad, rightPadMin } from './blocks/utils/pad';
import { stripAsni } from './blocks/utils/strip-ansi';

export type Task = {
	loadingMessage: string;
	completedMessage: string;
	run: () => Promise<void>;
};

type TaskOptions = {
	verbose?: (msg: string) => void;
};

const runTasks = async (tasks: Task[], { verbose = undefined }: TaskOptions) => {
	const loading = spinner();

	for (const task of tasks) {
		if (verbose) {
			verbose(task.loadingMessage);
		} else {
			loading.start(task.loadingMessage);
		}

		try {
			await task.run();
		} catch (err) {
			loading.stop(`Error while ${task.loadingMessage}`);
			console.error(err);
		}

		if (verbose) {
			verbose(task.completedMessage);
		} else {
			loading.stop(task.completedMessage);
		}
	}
};

export type ConcurrentTask = {
	run: ({ message }: { message: (str: string) => void }) => Promise<void>;
};

export type ConcurrentOptions = {
	startMessage: string;
	stopMessage: string;
	tasks: ConcurrentTask[];
	verbose?: (msg: string) => void;
};

const runTasksConcurrently = async ({
	tasks,
	startMessage,
	stopMessage,
	verbose,
}: ConcurrentOptions) => {
	const loading = spinner();

	const message = (msg: string) => {
		if (verbose) {
			verbose(msg);
		} else {
			loading.message(msg);
		}
	};

	if (verbose) {
		verbose(startMessage);
	} else {
		loading.start(startMessage);
	}

	await Promise.all([...tasks.map((t) => t.run({ message }))]);

	if (verbose) {
		verbose(stopMessage);
	} else {
		loading.stop(stopMessage);
	}
};

const nextSteps = (steps: string[]): string => {
	let max = 20;
	steps.map((val) => {
		const reset = rightPad(stripAsni(val), 4);

		if (reset.length > max) max = reset.length;
	});

	const NEXT_STEPS = 'Next Steps';

	let result = `${ascii.VERTICAL_LINE}\n`;

	// top
	result += `${ascii.JUNCTION_RIGHT}  ${NEXT_STEPS} ${ascii.HORIZONTAL_LINE.repeat(
		max - NEXT_STEPS.length - 1
	)}${ascii.TOP_RIGHT_CORNER}\n`;

	result += `${ascii.VERTICAL_LINE} ${' '.repeat(max)} ${ascii.VERTICAL_LINE}\n`;

	steps.map((step) => {
		result += `${ascii.VERTICAL_LINE}  ${rightPadMin(step, max - 1)} ${ascii.VERTICAL_LINE}\n`;
	});

	result += `${ascii.VERTICAL_LINE} ${' '.repeat(max)} ${ascii.VERTICAL_LINE}\n`;

	// bottom
	result += `${ascii.JUNCTION_RIGHT}${ascii.HORIZONTAL_LINE.repeat(max + 2)}${ascii.BOTTOM_RIGHT_CORNER}\n`;

	return result;
};

const truncatedList = (items: string[], maxLength = 3) => {
	const truncated = items.slice(0, maxLength);

	const remaining = items.length - truncated.length;

	return `${truncated.join(', ')}${remaining > 0 ? ` and ${remaining} other(s)` : ''}`;
};

const _intro = (version: string) =>
	intro(`${color.bgHex('#f7df1e').black(' jsrepo ')}${color.gray(` v${version} `)}`);

export { runTasks, nextSteps, _intro as intro, runTasksConcurrently, truncatedList };
