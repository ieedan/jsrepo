import fs from 'node:fs';
import path from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CaseInsensitiveSet } from '../src/utils/case-insensitive-set';

describe('CaseInsensitiveSet', () => {
	describe('constructor and initialization', () => {
		it('creates empty set by default', () => {
			const set = new CaseInsensitiveSet<string>();
			expect(set.size).toBe(0);
		});

		it('accepts initial values from array', () => {
			const set = new CaseInsensitiveSet<string>(['Hello', 'World']);
			expect(set.size).toBe(2);
			expect(set.has('hello')).toBe(true);
			expect(set.has('world')).toBe(true);
		});

		it('deduplicates case-insensitive values during construction', () => {
			const set = new CaseInsensitiveSet<string>(['Hello', 'HELLO', 'hello']);
			expect(set.size).toBe(1);
			expect(Array.from(set)[0]).toBe('Hello'); // First one wins
		});

		it('handles empty iterables in constructor', () => {
			const emptySet = new CaseInsensitiveSet<string>([]);
			expect(emptySet.size).toBe(0);
		});
	});

	describe('add and duplicate prevention', () => {
		it('prevents duplicate registries with different casing', () => {
			const set = new CaseInsensitiveSet<string>();
			set.add('github/ieedan/std');
			set.add('github/Ieedan/std');
			set.add('GITHUB/IEEDAN/STD');

			expect(set.size).toBe(1);
			expect(set.has('github/ieedan/std')).toBe(true);
			expect(set.has('github/Ieedan/std')).toBe(true);
			expect(set.has('GITHUB/IEEDAN/STD')).toBe(true);
		});

		it('preserves original casing of first added item', () => {
			const set = new CaseInsensitiveSet<string>();
			set.add('github/Ieedan/std');
			set.add('github/ieedan/std');

			expect(Array.from(set)[0]).toBe('github/Ieedan/std');
		});

		it('allows method chaining', () => {
			const set = new CaseInsensitiveSet<string>();
			const result = set.add('test1').add('test2');

			expect(result).toBe(set);
			expect(set.size).toBe(2);
		});
	});

	describe('has method', () => {
		it('finds items case-insensitively', () => {
			const set = new CaseInsensitiveSet<string>(['GitHub/User/Repo']);

			expect(set.has('github/user/repo')).toBe(true);
			expect(set.has('GITHUB/USER/REPO')).toBe(true);
			expect(set.has('GitHub/User/Repo')).toBe(true);
			expect(set.has('different/repo')).toBe(false);
		});

		it('handles international characters', () => {
			const set = new CaseInsensitiveSet<string>(['Café']);

			expect(set.has('café')).toBe(true);
			expect(set.has('CAFÉ')).toBe(true);
		});
	});

	describe('delete method', () => {
		it('deletes items case-insensitively', () => {
			const set = new CaseInsensitiveSet<string>();
			set.add('github/ieedan/std');

			expect(set.delete('GITHUB/IEEDAN/STD')).toBe(true);
			expect(set.size).toBe(0);
			expect(set.has('github/ieedan/std')).toBe(false);
		});

		it('returns false for non-existent items', () => {
			const set = new CaseInsensitiveSet<string>(['test']);

			expect(set.delete('nonexistent')).toBe(false);
			expect(set.size).toBe(1);
		});
	});

	describe('clear method', () => {
		it('clears all items', () => {
			const set = new CaseInsensitiveSet<string>();
			set.add('github/ieedan/std');
			set.add('gitlab/user/repo');

			set.clear();
			expect(set.size).toBe(0);
		});
	});

	describe('iteration methods', () => {
		const testSet = new CaseInsensitiveSet<string>(['Hello', 'World']);

		it('supports for...of iteration', () => {
			const values: string[] = [];
			for (const value of testSet) {
				values.push(value);
			}

			expect(values).toEqual(['Hello', 'World']);
		});

		it('supports spread operator', () => {
			expect([...testSet]).toEqual(['Hello', 'World']);
		});

		it('supports Array.from()', () => {
			expect(Array.from(testSet)).toEqual(['Hello', 'World']);
		});

		it('values() returns iterator', () => {
			const values = Array.from(testSet.values());
			expect(values).toEqual(['Hello', 'World']);
		});

		it('keys() returns same as values()', () => {
			const keys = Array.from(testSet.keys());
			expect(keys).toEqual(['Hello', 'World']);
		});

		it('entries() returns [value, value] pairs', () => {
			const entries = Array.from(testSet.entries());
			expect(entries).toEqual([
				['Hello', 'Hello'],
				['World', 'World'],
			]);
		});
	});

	describe('forEach method', () => {
		it('executes callback for each value', () => {
			const set = new CaseInsensitiveSet<string>(['A', 'B']);
			const values: string[] = [];

			set.forEach((value, value2, thisSet) => {
				expect(value).toBe(value2); // Both should be the same
				expect(thisSet).toBe(set);
				values.push(value);
			});

			expect(values).toEqual(['A', 'B']);
		});

		it('respects thisArg parameter', () => {
			const set = new CaseInsensitiveSet<string>(['test']);
			const context = { prefix: 'Hello: ' };

			// biome-ignore lint/complexity/noForEach: Testing the behavior of forEach with a custom thisArg
			set.forEach(function (this: typeof context) {
				expect(this.prefix).toBe('Hello: ');
			}, context);
		});
	});

	describe('edge cases and error handling', () => {
		it('handles very long strings', () => {
			const longString = 'a'.repeat(10000);
			const set = new CaseInsensitiveSet<string>();
			set.add(longString);
			expect(set.has(longString.toUpperCase())).toBe(true);
		});

		it('handles strings with mixed scripts', () => {
			const set = new CaseInsensitiveSet<string>();
			set.add('Hello世界');
			expect(set.has('HELLO世界')).toBe(true);
		});

		it('handles malformed unicode sequences gracefully', () => {
			const malformed = '\uD800'; // Lone surrogate
			const set = new CaseInsensitiveSet<string>();
			set.add(malformed);
			expect(set.has(malformed)).toBe(true);
		});

		it('handles maximum string length gracefully', () => {
			const maxString = 'x'.repeat(65536); // Large but reasonable string
			const set = new CaseInsensitiveSet<string>();

			expect(() => set.add(maxString)).not.toThrow();
			expect(set.has(maxString.toUpperCase())).toBe(true);
		});
	});
});

describe('memory and performance', () => {
	it('handles rapid add/delete cycles', () => {
		const set = new CaseInsensitiveSet<string>();

		for (let i = 0; i < 1000; i++) {
			set.add(`item${i}`);
			if (i % 2 === 0) {
				set.delete(`ITEM${i}`);
			}
		}

		expect(set.size).toBe(500);
	});
});

describe('registry-specific scenarios', () => {
	it('handles common registry URL patterns', () => {
		const registryUrls = [
			'github/ieedan/std',
			'GitHub/Ieedan/Std',
			'GITHUB/IEEDAN/STD',
			'gitlab/user/project',
			'GitLab/User/Project',
			'@scope/package',
			'@SCOPE/PACKAGE',
		];

		const set = new CaseInsensitiveSet<string>(registryUrls);
		expect(set.size).toBe(3); // Should deduplicate case variants
	});

	it('preserves original casing for display in registry context', () => {
		const set = new CaseInsensitiveSet<string>();
		set.add('github/MyOrg/MyRepo');
		set.add('GITHUB/MYORG/MYREPO');

		// Should preserve the first added casing for display
		const displayed = Array.from(set)[0];
		expect(displayed).toBe('github/MyOrg/MyRepo');
	});
});

describe('jsrepo integration patterns', () => {
	it('works with repository resolution patterns', () => {
		// Simulate the pattern used in add command
		const mustResolveRepos = new CaseInsensitiveSet<string>();
		const repos = ['github/ieedan/std', 'GitHub/Ieedan/Std'];

		for (const repo of repos) {
			mustResolveRepos.add(repo);
		}

		expect(mustResolveRepos.size).toBe(1);
		expect(mustResolveRepos.has('GITHUB/IEEDAN/STD')).toBe(true);
	});

	it('maintains compatibility with Array.from() usage in init command', () => {
		// Simulate the pattern from init.ts
		const registries = ['github/user/repo1'];
		const options = { repos: ['GitHub/User/Repo1', 'gitlab/user/repo2'] };

		const repos = Array.from(new CaseInsensitiveSet([...registries, ...(options.repos ?? [])]));

		expect(repos).toHaveLength(2);
		expect(repos).toContain('github/user/repo1'); // First casing preserved
		expect(repos).toContain('gitlab/user/repo2');
	});
});

describe('CLI integration tests', () => {
	const testDir = path.join(__dirname, '../temp-test/case-sensitivity');
	const originalCWD = process.cwd();

	beforeAll(() => {
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true });
		}
		fs.mkdirSync(testDir, { recursive: true });
		process.chdir(testDir);
	});

	afterAll(() => {
		process.chdir(originalCWD);
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true });
		}
	});

	it('prevents duplicate registries with different casing in init command', async () => {
		// This would require actual CLI integration
		// For now, we test the core logic that would be used
		const registries = ['github/ieedan/std'];
		const options = { repos: ['GitHub/Ieedan/Std'] };

		const repos = Array.from(new CaseInsensitiveSet([...registries, ...(options.repos ?? [])]));

		expect(repos).toHaveLength(1);
		expect(repos[0].toLowerCase()).toBe('github/ieedan/std');
	});

	it('preserves original casing in configuration', () => {
		const set = new CaseInsensitiveSet<string>();
		set.add('github/Ieedan/std');
		set.add('github/ieedan/std'); // Should not be added

		const config = { repos: Array.from(set) };
		expect(config.repos[0]).toBe('github/Ieedan/std');
	});
});
