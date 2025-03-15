import { assert, describe, expect, it } from 'vitest';
import { MANIFEST_FILE } from '../src/constants';
import * as registry from '../src/utils/registry-providers/internal';
import type { ParseOptions, ParseResult } from '../src/utils/registry-providers/types';

type ParseTestCase = {
	url: string;
	opts: ParseOptions;
	expected: ParseResult;
};

type StringTestCase = {
	url: string;
	expected: string;
};

describe('github', () => {
	it('correctly parses urls', () => {
		const cases: ParseTestCase[] = [
			{
				url: 'https://github.com/ieedan/std',
				opts: { fullyQualified: false },
				expected: {
					url: 'github/ieedan/std',
					specifier: undefined,
				},
			},
			{
				url: 'github/ieedan/std',
				opts: { fullyQualified: false },
				expected: {
					url: 'github/ieedan/std',
					specifier: undefined,
				},
			},
			{
				url: 'github/ieedan/std/tree/v2.0.0',
				opts: { fullyQualified: false },
				expected: {
					url: 'github/ieedan/std/tree/v2.0.0',
					specifier: undefined,
				},
			},
			{
				url: 'https://github.com/ieedan/std/tree/v2.0.0',
				opts: { fullyQualified: false },
				expected: {
					url: 'github/ieedan/std/tree/v2.0.0',
					specifier: undefined,
				},
			},
			{
				url: 'github/ieedan/std/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'github/ieedan/std',
					specifier: 'utils/math',
				},
			},
			{
				url: 'https://github.com/ieedan/std/tree/v2.0.0/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'github/ieedan/std/tree/v2.0.0',
					specifier: 'utils/math',
				},
			},
		];

		for (const c of cases) {
			expect(registry.github.parse(c.url, c.opts)).toStrictEqual(c.expected);
		}
	});

	it('correctly parses base url', () => {
		const cases: StringTestCase[] = [
			{
				url: 'github/ieedan/std',
				expected: 'https://github.com/ieedan/std',
			},
			{
				url: 'https://github.com/ieedan/std',
				expected: 'https://github.com/ieedan/std',
			},
			{
				url: 'github/ieedan/std/tree/next',
				expected: 'https://github.com/ieedan/std',
			},
		];

		for (const c of cases) {
			expect(registry.github.baseUrl(c.url)).toBe(c.expected);
		}
	});

	it('Fetches the manifest from a public repo', async () => {
		const repoURL = 'github/ieedan/std';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		const content = await registry.fetchManifest(providerState.unwrap());

		expect(content.isErr()).toBe(false);
	});

	it('Fetches the manifest from a public repo with a tag', async () => {
		const repoURL = 'https://github.com/ieedan/std/tree/v1.6.0';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		// this way we just get the text and skip the schema validation
		const content = await registry.fetchRaw(providerState.unwrap(), 'jsrepo-manifest.json');

		expect(content.unwrap()).toBe(`[
	{
		"name": "types",
		"blocks": [
			{
				"name": "result",
				"directory": "src/types",
				"category": "types",
				"tests": true,
				"subdirectory": false,
				"files": ["result.ts", "result.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			}
		]
	},
	{
		"name": "utilities",
		"blocks": [
			{
				"name": "array-sum",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["array-sum.ts", "array-sum.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "array-to-map",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["array-to-map.ts", "array-to-map.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "dispatcher",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["dispatcher.ts", "dispatcher.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "ipv4-address",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["ipv4-address.ts", "ipv4-address.test.ts"],
				"localDependencies": ["types/result", "utilities/is-number"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "is-number",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["is-number.ts", "is-number.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "lines",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["lines.ts", "lines.test.ts"],
				"localDependencies": ["utilities/pad"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "map-to-array",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["map-to-array.ts", "map-to-array.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "math",
				"directory": "src/utilities/math",
				"category": "utilities",
				"tests": true,
				"subdirectory": true,
				"files": [
					"circle.test.ts",
					"circle.ts",
					"conversions.test.ts",
					"conversions.ts",
					"fractions.test.ts",
					"fractions.ts",
					"gcf.test.ts",
					"gcf.ts",
					"index.ts",
					"triangles.test.ts",
					"triangles.ts",
					"types.ts"
				],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "pad",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["pad.ts", "pad.test.ts"],
				"localDependencies": ["utilities/strip-ansi"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "sleep",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["sleep.ts", "sleep.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "stopwatch",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["stopwatch.ts", "stopwatch.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "strip-ansi",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["strip-ansi.ts", "strip-ansi.test.ts"],
				"localDependencies": [],
				"dependencies": ["ansi-regex@^6.1.0"],
				"devDependencies": []
			},
			{
				"name": "truncate",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["truncate.ts", "truncate.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			}
		]
	}
]
`);
	});
});

describe('gitlab', () => {
	it('correctly parses urls', () => {
		const cases: ParseTestCase[] = [
			{
				url: 'https://gitlab.com/ieedan/std',
				opts: { fullyQualified: false },
				expected: {
					url: 'https://gitlab.com/ieedan/std',
					specifier: undefined,
				},
			},
			{
				url: 'gitlab/ieedan/std',
				opts: { fullyQualified: false },
				expected: {
					url: 'https://gitlab.com/ieedan/std',
					specifier: undefined,
				},
			},
			{
				url: 'gitlab/ieedan/std/-/tree/next',
				opts: { fullyQualified: false },
				expected: {
					url: 'https://gitlab.com/ieedan/std/-/tree/next',
					specifier: undefined,
				},
			},
			{
				url: 'https://gitlab.com/ieedan/std/-/tree/v2.0.0',
				opts: { fullyQualified: false },
				expected: {
					url: 'https://gitlab.com/ieedan/std/-/tree/v2.0.0',
					specifier: undefined,
				},
			},
			{
				url: 'https://gitlab.com/ieedan/std/-/tree/v2.0.0?ref_type=tags',
				opts: { fullyQualified: false },
				expected: {
					url: 'https://gitlab.com/ieedan/std/-/tree/v2.0.0',
					specifier: undefined,
				},
			},
			{
				url: 'https://gitlab.com/ieedan/std/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'https://gitlab.com/ieedan/std',
					specifier: 'utils/math',
				},
			},
			{
				url: 'gitlab/ieedan/std/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'https://gitlab.com/ieedan/std',
					specifier: 'utils/math',
				},
			},
			{
				url: 'gitlab/ieedan/std/-/tree/v2.0.0/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'https://gitlab.com/ieedan/std/-/tree/v2.0.0',
					specifier: 'utils/math',
				},
			},
			{
				url: 'gitlab:https://example.com/ieedan/std',
				opts: { fullyQualified: false },
				expected: {
					url: 'https://example.com/ieedan/std',
					specifier: undefined,
				},
			},
		];

		for (const c of cases) {
			expect(registry.gitlab.parse(c.url, c.opts)).toStrictEqual(c.expected);
		}
	});

	it('correctly parses base url', () => {
		const cases: StringTestCase[] = [
			{
				url: 'gitlab/ieedan/std',
				expected: 'https://gitlab.com/ieedan/std',
			},
			{
				url: 'https://gitlab.com/ieedan/std',
				expected: 'https://gitlab.com/ieedan/std',
			},
			{
				url: 'gitlab/ieedan/std/-/tree/next',
				expected: 'https://gitlab.com/ieedan/std',
			},
			{
				url: 'gitlab:https://example.com/ieedan/std/-/tree/next',
				expected: 'https://example.com/ieedan/std',
			},
		];

		for (const c of cases) {
			expect(registry.gitlab.baseUrl(c.url)).toBe(c.expected);
		}
	});

	it('Fetches the manifest from a public repo', async () => {
		const repoURL = 'gitlab/ieedan/std';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		const content = await registry.fetchManifest(providerState.unwrap());

		expect(content.isErr()).toBe(false);
	});

	it('Fetches the manifest from a public repo with a tag', async () => {
		const repoURL = 'https://gitlab.com/ieedan/std/-/tree/v1.6.0';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		// this way we just get the text and skip the schema validation
		const content = await registry.fetchRaw(providerState.unwrap(), 'jsrepo-manifest.json');

		expect(content.unwrap()).toBe(`[
	{
		"name": "types",
		"blocks": [
			{
				"name": "result",
				"directory": "src/types",
				"category": "types",
				"tests": true,
				"subdirectory": false,
				"files": ["result.ts", "result.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			}
		]
	},
	{
		"name": "utilities",
		"blocks": [
			{
				"name": "array-sum",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["array-sum.ts", "array-sum.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "array-to-map",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["array-to-map.ts", "array-to-map.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "dispatcher",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["dispatcher.ts", "dispatcher.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "ipv4-address",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["ipv4-address.ts", "ipv4-address.test.ts"],
				"localDependencies": ["types/result", "utilities/is-number"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "is-number",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["is-number.ts", "is-number.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "lines",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["lines.ts", "lines.test.ts"],
				"localDependencies": ["utilities/pad"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "map-to-array",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["map-to-array.ts", "map-to-array.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "math",
				"directory": "src/utilities/math",
				"category": "utilities",
				"tests": true,
				"subdirectory": true,
				"files": [
					"circle.test.ts",
					"circle.ts",
					"conversions.test.ts",
					"conversions.ts",
					"fractions.test.ts",
					"fractions.ts",
					"gcf.test.ts",
					"gcf.ts",
					"index.ts",
					"triangles.test.ts",
					"triangles.ts",
					"types.ts"
				],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "pad",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["pad.ts", "pad.test.ts"],
				"localDependencies": ["utilities/strip-ansi"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "sleep",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["sleep.ts", "sleep.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "stopwatch",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["stopwatch.ts", "stopwatch.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "strip-ansi",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["strip-ansi.ts", "strip-ansi.test.ts"],
				"localDependencies": [],
				"dependencies": ["ansi-regex@^6.1.0"],
				"devDependencies": []
			},
			{
				"name": "truncate",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["truncate.ts", "truncate.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			}
		]
	}
]
`);
	});

	it('Fetches the manifest with "gitlab" prefix', async () => {
		const repoURL = 'gitlab:https://gitlab.com/ieedan/std';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		const content = await registry.fetchManifest(providerState.unwrap());

		expect(content.isErr()).toBe(false);
	});

	// this is just here to make sure fetch manifest is actually using the right url
	it('Fails to fetch with incorrect prefixed url', async () => {
		const repoURL = 'gitlab:https://gitlab.om/ieedan/std';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		const content = await registry.fetchManifest(providerState.unwrap());

		expect(content.isErr()).toBe(true);
	});
});

describe('bitbucket', () => {
	it('correctly parses urls', () => {
		const cases: ParseTestCase[] = [
			{
				url: 'https://bitbucket.org/ieedan/std/src/main/',
				opts: { fullyQualified: false },
				expected: {
					url: 'bitbucket/ieedan/std/src/main',
					specifier: undefined,
				},
			},
			{
				url: 'bitbucket/ieedan/std',
				opts: { fullyQualified: false },
				expected: {
					url: 'bitbucket/ieedan/std',
					specifier: undefined,
				},
			},
			{
				url: 'bitbucket/ieedan/std/src/next',
				opts: { fullyQualified: false },
				expected: {
					url: 'bitbucket/ieedan/std/src/next',
					specifier: undefined,
				},
			},
			{
				url: 'bitbucket/ieedan/std/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'bitbucket/ieedan/std',
					specifier: 'utils/math',
				},
			},
			{
				url: 'bitbucket/ieedan/std/src/next/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'bitbucket/ieedan/std/src/next',
					specifier: 'utils/math',
				},
			},
		];

		for (const c of cases) {
			expect(registry.bitbucket.parse(c.url, c.opts)).toStrictEqual(c.expected);
		}
	});

	it('correctly parses base url', () => {
		const cases: StringTestCase[] = [
			{
				url: 'bitbucket/ieedan/std',
				expected: 'https://bitbucket.org/ieedan/std',
			},
			{
				url: 'https://bitbucket.org/ieedan/std',
				expected: 'https://bitbucket.org/ieedan/std',
			},
			{
				url: 'bitbucket/ieedan/std/tree/next',
				expected: 'https://bitbucket.org/ieedan/std',
			},
		];

		for (const c of cases) {
			expect(registry.bitbucket.baseUrl(c.url)).toBe(c.expected);
		}
	});

	it('Fetches the manifest from a public repo', async () => {
		const repoURL = 'bitbucket/ieedan/std';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		const content = await registry.fetchManifest(providerState.unwrap());

		expect(content.isErr()).toBe(false);
	});

	it('Fetches the manifest from a public repo with a tag', async () => {
		const repoURL = 'https://bitbucket.org/ieedan/std/src/v1.6.0';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		// this way we just get the text and skip the schema validation
		const content = await registry.fetchRaw(providerState.unwrap(), 'jsrepo-manifest.json');

		expect(content.unwrap()).toBe(`[
	{
		"name": "types",
		"blocks": [
			{
				"name": "result",
				"directory": "src/types",
				"category": "types",
				"tests": true,
				"subdirectory": false,
				"files": ["result.ts", "result.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			}
		]
	},
	{
		"name": "utilities",
		"blocks": [
			{
				"name": "array-sum",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["array-sum.ts", "array-sum.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "array-to-map",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["array-to-map.ts", "array-to-map.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "dispatcher",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["dispatcher.ts", "dispatcher.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "ipv4-address",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["ipv4-address.ts", "ipv4-address.test.ts"],
				"localDependencies": ["types/result", "utilities/is-number"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "is-number",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["is-number.ts", "is-number.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "lines",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["lines.ts", "lines.test.ts"],
				"localDependencies": ["utilities/pad"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "map-to-array",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["map-to-array.ts", "map-to-array.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "math",
				"directory": "src/utilities/math",
				"category": "utilities",
				"tests": true,
				"subdirectory": true,
				"files": [
					"circle.test.ts",
					"circle.ts",
					"conversions.test.ts",
					"conversions.ts",
					"fractions.test.ts",
					"fractions.ts",
					"gcf.test.ts",
					"gcf.ts",
					"index.ts",
					"triangles.test.ts",
					"triangles.ts",
					"types.ts"
				],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "pad",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["pad.ts", "pad.test.ts"],
				"localDependencies": ["utilities/strip-ansi"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "sleep",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["sleep.ts", "sleep.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "stopwatch",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["stopwatch.ts", "stopwatch.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "strip-ansi",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["strip-ansi.ts", "strip-ansi.test.ts"],
				"localDependencies": [],
				"dependencies": ["ansi-regex@^6.1.0"],
				"devDependencies": []
			},
			{
				"name": "truncate",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["truncate.ts", "truncate.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			}
		]
	}
]
`);
	});
});

describe('azure', () => {
	it('correctly parses urls', () => {
		const cases: ParseTestCase[] = [
			{
				url: 'azure/ieedan/std/std',
				opts: { fullyQualified: false },
				expected: {
					url: 'azure/ieedan/std/std/heads/main',
					specifier: undefined,
				},
			},
			{
				url: 'azure/ieedan/std/std/tags/v2.0.0',
				opts: { fullyQualified: false },
				expected: {
					url: 'azure/ieedan/std/std/tags/v2.0.0',
					specifier: undefined,
				},
			},
			{
				url: 'azure/ieedan/std/std/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'azure/ieedan/std/std/heads/main',
					specifier: 'utils/math',
				},
			},
			{
				url: 'azure/ieedan/std/std/tags/v2.0.0/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'azure/ieedan/std/std/tags/v2.0.0',
					specifier: 'utils/math',
				},
			},
		];

		for (const c of cases) {
			expect(registry.azure.parse(c.url, c.opts)).toStrictEqual(c.expected);
		}
	});

	it('correctly parses base url', () => {
		const cases: StringTestCase[] = [
			{
				url: 'azure/ieedan/std/std',
				expected: 'https://dev.azure.com/ieedan/_git/std',
			},
			{
				url: 'azure/ieedan/std/std/heads/next',
				expected: 'https://dev.azure.com/ieedan/_git/std',
			},
		];

		for (const c of cases) {
			expect(registry.azure.baseUrl(c.url)).toBe(c.expected);
		}
	});

	it('Fetches the manifest from a public repo', async () => {
		const repoURL = 'azure/ieedan/std/std';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		const content = await registry.fetchManifest(providerState.unwrap());

		expect(content.isErr()).toBe(false);
	});

	it('Fetches the manifest from a public repo with a tag', async () => {
		const repoURL = 'azure/ieedan/std/std/tags/v1.6.0';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		// this way we just get the text and skip the schema validation
		const content = await registry.fetchRaw(providerState.unwrap(), 'jsrepo-manifest.json');

		expect(content.unwrap()).toBe(`[
	{
		"name": "types",
		"blocks": [
			{
				"name": "result",
				"directory": "src/types",
				"category": "types",
				"tests": true,
				"subdirectory": false,
				"files": ["result.ts", "result.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			}
		]
	},
	{
		"name": "utilities",
		"blocks": [
			{
				"name": "array-sum",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["array-sum.ts", "array-sum.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "array-to-map",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["array-to-map.ts", "array-to-map.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "dispatcher",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["dispatcher.ts", "dispatcher.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "ipv4-address",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["ipv4-address.ts", "ipv4-address.test.ts"],
				"localDependencies": ["types/result", "utilities/is-number"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "is-number",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["is-number.ts", "is-number.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "lines",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["lines.ts", "lines.test.ts"],
				"localDependencies": ["utilities/pad"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "map-to-array",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["map-to-array.ts", "map-to-array.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "math",
				"directory": "src/utilities/math",
				"category": "utilities",
				"tests": true,
				"subdirectory": true,
				"files": [
					"circle.test.ts",
					"circle.ts",
					"conversions.test.ts",
					"conversions.ts",
					"fractions.test.ts",
					"fractions.ts",
					"gcf.test.ts",
					"gcf.ts",
					"index.ts",
					"triangles.test.ts",
					"triangles.ts",
					"types.ts"
				],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "pad",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["pad.ts", "pad.test.ts"],
				"localDependencies": ["utilities/strip-ansi"],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "sleep",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["sleep.ts", "sleep.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "stopwatch",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["stopwatch.ts", "stopwatch.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "strip-ansi",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["strip-ansi.ts", "strip-ansi.test.ts"],
				"localDependencies": [],
				"dependencies": ["ansi-regex@^6.1.0"],
				"devDependencies": []
			},
			{
				"name": "truncate",
				"directory": "src/utilities",
				"category": "utilities",
				"tests": true,
				"subdirectory": false,
				"files": ["truncate.ts", "truncate.test.ts"],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": []
			}
		]
	}
]
`);
	});
});

describe('http', () => {
	it('correctly parses urls', () => {
		const cases: ParseTestCase[] = [
			{
				url: 'https://example.com/',
				opts: { fullyQualified: false },
				expected: {
					url: 'https://example.com/',
					specifier: undefined,
				},
			},
			{
				url: 'https://example.com/new-york',
				opts: { fullyQualified: false },
				expected: {
					url: 'https://example.com/new-york/',
					specifier: undefined,
				},
			},
			{
				url: 'https://example.com/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'https://example.com/',
					specifier: 'utils/math',
				},
			},
			{
				url: 'https://example.com/new-york/utils/math',
				opts: { fullyQualified: true },
				expected: {
					url: 'https://example.com/new-york/',
					specifier: 'utils/math',
				},
			},
		];

		for (const c of cases) {
			expect(registry.http.parse(c.url, c.opts)).toStrictEqual(c.expected);
		}
	});

	it('correctly resolves url', async () => {
		const cases: StringTestCase[] = [
			{
				url: 'https://example.com',
				expected: 'https://example.com/jsrepo-manifest.json',
			},
			{
				url: 'https://example.com/new-york',
				expected: 'https://example.com/new-york/jsrepo-manifest.json',
			},
		];

		for (const c of cases) {
			const state = await registry.getProviderState(c.url);

			assert(!state.isErr());

			expect(
				await state.unwrap().provider.resolveRaw(state.unwrap(), MANIFEST_FILE)
			).toStrictEqual(new URL(c.expected));
		}
	});

	it('correctly parses base url', () => {
		const cases: StringTestCase[] = [
			{
				url: 'https://example.com/',
				expected: 'https://example.com',
			},
			{
				url: 'https://example.com/new-york',
				expected: 'https://example.com',
			},
		];

		for (const c of cases) {
			expect(registry.http.baseUrl(c.url)).toBe(c.expected);
		}
	});

	it('Fetches the manifest', async () => {
		const repoURL = 'https://jsrepo-http.vercel.app';

		const providerState = await registry.getProviderState(repoURL);

		assert(providerState.isOk());

		// this way we just get the text and skip the schema validation
		const content = await registry.fetchRaw(providerState.unwrap(), 'jsrepo-manifest.json');

		expect(content.unwrap()).toBe(`[
	{
		"name": "types",
		"blocks": [
			{
				"name": "result",
				"directory": "src/types",
				"category": "types",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"result.ts",
					"result.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			}
		]
	},
	{
		"name": "utils",
		"blocks": [
			{
				"name": "array-sum",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"array-sum.ts",
					"array-sum.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "array-to-map",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"array-to-map.ts",
					"array-to-map.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "dispatcher",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"dispatcher.ts",
					"dispatcher.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "ipv4-address",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"ipv4-address.ts",
					"ipv4-address.test.ts"
				],
				"localDependencies": [
					"types/result",
					"utils/is-number"
				],
				"_imports_": {
					"../types/result": "{{types/result}}",
					"./is-number": "{{utils/is-number}}"
				},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "is-number",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"is-number.ts",
					"is-number.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "lines",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"lines.ts",
					"lines.test.ts"
				],
				"localDependencies": [
					"utils/pad"
				],
				"_imports_": {
					"./pad": "{{utils/pad}}"
				},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "map-to-array",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"map-to-array.ts",
					"map-to-array.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "math",
				"directory": "src/utils/math",
				"category": "utils",
				"tests": true,
				"subdirectory": true,
				"list": true,
				"files": [
					"circle.test.ts",
					"circle.ts",
					"conversions.test.ts",
					"conversions.ts",
					"fractions.test.ts",
					"fractions.ts",
					"gcf.test.ts",
					"gcf.ts",
					"index.ts",
					"triangles.test.ts",
					"triangles.ts",
					"types.ts"
				],
				"localDependencies": [],
				"dependencies": [],
				"devDependencies": [],
				"_imports_": {}
			},
			{
				"name": "pad",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"pad.ts",
					"pad.test.ts"
				],
				"localDependencies": [
					"utils/strip-ansi"
				],
				"_imports_": {
					"./strip-ansi": "{{utils/strip-ansi}}"
				},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "perishable-list",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"perishable-list.ts",
					"perishable-list.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "rand",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"rand.ts",
					"rand.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "sleep",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"sleep.ts",
					"sleep.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "stopwatch",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"stopwatch.ts",
					"stopwatch.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			},
			{
				"name": "strip-ansi",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"strip-ansi.ts",
					"strip-ansi.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [
					"ansi-regex@^6.1.0"
				],
				"devDependencies": []
			},
			{
				"name": "truncate",
				"directory": "src/utils",
				"category": "utils",
				"tests": true,
				"subdirectory": false,
				"list": true,
				"files": [
					"truncate.ts",
					"truncate.test.ts"
				],
				"localDependencies": [],
				"_imports_": {},
				"dependencies": [],
				"devDependencies": []
			}
		]
	}
]`);
	});
});
