<script lang="ts">
	import { CodeSpan, DocHeader, Jsrepo } from '$lib/components/site/docs';
	import * as Table from '$lib/components/ui/table/index.js';
	import type { Snippet } from 'svelte';
	import * as Icons from '$lib/components/icons';
	import { Braces } from '@lucide/svelte';

	type Status = '✅' | '⌛️' | '🚫' | '⚠️';

	type SupportedLanguage = {
		logo?: (opts: { size: number }) => ReturnType<Snippet>;
		name: string;
		dependencyResolutionStatus: Status;
		formattingStatus: Status;
		watermarkStatus: Status;
	};

	const supportedLanguages: SupportedLanguage[] = [
		{
			logo: javascript,
			name: '*.js',
			dependencyResolutionStatus: '✅',
			formattingStatus: '✅',
			watermarkStatus: '✅'
		},
		{
			logo: typescript,
			name: '*.ts',
			dependencyResolutionStatus: '✅',
			formattingStatus: '✅',
			watermarkStatus: '✅'
		},
		{
			logo: jsx,
			name: '*.jsx',
			dependencyResolutionStatus: '✅',
			formattingStatus: '✅',
			watermarkStatus: '✅'
		},
		{
			logo: tsx,
			name: '*.tsx',
			dependencyResolutionStatus: '✅',
			formattingStatus: '✅',
			watermarkStatus: '✅'
		},
		{
			logo: svelte,
			name: '*.svelte',
			dependencyResolutionStatus: '✅',
			formattingStatus: '⚠️',
			watermarkStatus: '✅'
		},
		{
			logo: vue,
			name: '*.vue',
			dependencyResolutionStatus: '✅',
			formattingStatus: '⚠️',
			watermarkStatus: '✅'
		},
		{
			logo: yaml,
			name: '*.(yaml|yml)',
			dependencyResolutionStatus: '🚫',
			formattingStatus: '⚠️',
			watermarkStatus: '✅'
		},
		{
			logo: json,
			name: '*.json',
			dependencyResolutionStatus: '🚫',
			formattingStatus: '✅',
			watermarkStatus: '🚫'
		},
		{
			logo: json,
			name: '*.jsonc',
			dependencyResolutionStatus: '🚫',
			formattingStatus: '✅',
			watermarkStatus: '✅'
		},
		{
			logo: css,
			name: '*.css',
			dependencyResolutionStatus: '✅',
			formattingStatus: '✅',
			watermarkStatus: '✅'
		},
		{
			logo: svg,
			name: '*.svg',
			dependencyResolutionStatus: '🚫',
			formattingStatus: '🚫',
			watermarkStatus: '✅'
		},
		{
			logo: sass,
			name: '*.(sass|scss)',
			dependencyResolutionStatus: '✅',
			formattingStatus: '⚠️',
			watermarkStatus: '✅'
		},
		{
			logo: html,
			name: '*.(html)',
			dependencyResolutionStatus: '⚠️',
			formattingStatus: '⚠️',
			watermarkStatus: '✅'
		}
	];
</script>

<!-- icon snippets -->

{#snippet typescript({ size }: { size: number })}
	<Icons.TypeScript width={size} class="size-auto" />
{/snippet}

{#snippet javascript({ size }: { size: number })}
	<Icons.JavaScript width={size} class="size-auto" />
{/snippet}

{#snippet tsx({ size }: { size: number })}
	<Icons.React width={size} class="size-auto" />
{/snippet}

{#snippet jsx({ size }: { size: number })}
	<Icons.React width={size} class="size-auto text-[#f7df1e]" />
{/snippet}

{#snippet svelte({ size }: { size: number })}
	<Icons.Svelte width={size} class="size-auto" />
{/snippet}

{#snippet vue({ size }: { size: number })}
	<Icons.Vue width={size} class="size-auto" />
{/snippet}

{#snippet yaml({ size }: { size: number })}
	<Icons.Yaml height={size} class="size-auto" />
{/snippet}

{#snippet json({ size }: { size: number })}
	<Braces height={size} class="size-[18px] text-[#f7df1e]" />
{/snippet}

{#snippet svg({ size }: { size: number })}
	<Icons.Svg height={size} class="size-auto" />
{/snippet}

{#snippet css({ size }: { size: number })}
	<Icons.CSS height={size} />
{/snippet}

{#snippet sass({ size }: { size: number })}
	<Icons.SASS height={size} />
{/snippet}

{#snippet html({ size }: { size: number })}
	<Icons.HTML height={size} />
{/snippet}

<DocHeader
	title="Language Support"
	description="Languages that jsrepo supports in your registry."
/>
<p>
	<Jsrepo /> has to analyze your code to resolve any local/remote dependencies. Because of this it needs
	to explicitly support languages for them to be used in your registry.
</p>
<div class="flex flex-col gap-1">
	<span>Legend:</span>
	<ul class="list-disc pl-5">
		<li>✅: Supported</li>
		<li>⌛️: In progress</li>
		<li>🚫: Not in progress</li>
		<li>⚠️: Partial support</li>
	</ul>
</div>
<Table.Root class="w-fit">
	<Table.Caption><Jsrepo /> language support.</Table.Caption>
	<Table.Header>
		<Table.Row>
			<Table.Head>Language</Table.Head>
			<Table.Head>Dependencies</Table.Head>
			<Table.Head>Formatting</Table.Head>
			<Table.Head>Watermarks</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each supportedLanguages as { name, logo, dependencyResolutionStatus, formattingStatus, watermarkStatus } (name)}
			<Table.Row>
				<Table.Cell>
					<div class="flex place-items-center gap-2">
						{#if logo}
							{@render logo({ size: 18 })}
						{/if}
						<CodeSpan>{name}</CodeSpan>
					</div>
				</Table.Cell>
				<Table.Cell>{dependencyResolutionStatus}</Table.Cell>
				<Table.Cell>{formattingStatus}</Table.Cell>
				<Table.Cell>{watermarkStatus}</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
