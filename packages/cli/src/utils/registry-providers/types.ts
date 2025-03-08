export interface RegistryProvider {
	/** Short name for the provider that will be used when it is displayed to the user */
	name: string;
	/** Used to determine if the provided url belongs to this provider
	 *
	 * @param url
	 * @returns
	 */
	matches: (url: string) => boolean;
	/** Parse a URL that belongs to the provider
	 *
	 * @param url
	 * @param opts
	 * @returns
	 */
	parse: (url: string, opts: ParseOptions) => ParseResult;
	/** Parses the url and returns the origin of the url.
	 *
	 * `github/ieedan/std/tree/next -> github/ieedan/std`
	 *
	 * `https://example.com/new-york -> https://example.com`
	 *
	 * @param url
	 * @returns
	 */
	baseUrl: (url: string) => string;
	/** Gets the provider state by parsing the url and taking care of any loose ends
	 *
	 * @param url
	 * @returns
	 */
	state: (url: string, opts?: StateOptions) => Promise<RegistryProviderState>;
	/** Returns a URL to the raw path of the resource provided in the resourcePath
	 *
	 * @param repoPath
	 * @param resourcePath
	 * @returns
	 */
	resolveRaw: (state: RegistryProviderState, resourcePath: string, tag?: string) => Promise<URL>;
	/** Different providers use different authorization schemes.
	 *  Provide this method with a token to get the key value pair for the authorization header.
	 *
	 * @param token
	 * @returns
	 */
	authHeader?: (token: string) => [string, string];
	/** Returns a formatted error for a fetch error giving possible reasons for failure */
	formatFetchError: (state: RegistryProviderState, filePath: string, error: unknown) => string;
}

export type ParseOptions = {
	/** Set true when the provided path ends with `<category>/<block>` */
	fullyQualified?: boolean;
};

export type ParseResult = {
	/** a universal url ex: `https://github.com/ieedan/std -> github/ieedan/std` */
	url: string;
	/** The block specifier `<category>/<block>` */
	specifier?: string;
};

export type StateOptions = {
	token?: string;
	/** Override the fetch method. If you are using this in a node environment you will want to pass `node-fetch` */
	fetch?: typeof fetch;
};

/** Pass this to the `.provider` property of this to access the methods for this provider */
export interface RegistryProviderState {
	url: string;
	provider: RegistryProvider;
}
