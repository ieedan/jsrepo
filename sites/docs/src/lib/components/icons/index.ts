import type { HTMLAttributes } from 'svelte/elements';
import GitHub from './github.svelte';
import TypeScript from './typescript.svelte';
import Svelte from './svelte.svelte';
import React from './react.svelte';
import JavaScript from './javascript.svelte';
import Vue from './vue.svelte';
import Jsrepo from './jsrepo.svelte';
import GitLab from './gitlab.svelte';
import BitBucket from './bitbucket.svelte';
import Yaml from './yaml.svelte';

export interface Props extends HTMLAttributes<SVGElement> {
	class?: string;
	width?: number;
	height?: number;
}

export { GitHub, TypeScript, Svelte, React, JavaScript, Vue, Jsrepo, GitLab, BitBucket, Yaml };
