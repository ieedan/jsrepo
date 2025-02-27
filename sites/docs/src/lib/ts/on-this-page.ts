import { persistedContext } from './persisted-context-provider';

type Heading = {
	rank: 2 | 3 | 4 | 5 | 6;
	el: HTMLHeadingElement;
	children: Heading[];
};

type PageMap = {
	/** Only used on mount */
	curr?: {
		path: string;
		headings: Heading[];
	};
	headings: Map<string, Heading[]>;
};

export const onThisPage = persistedContext<PageMap>('on-this-page');
