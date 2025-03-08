import color from 'chalk';
import nodeFetch from 'node-fetch';
import { program } from 'commander';
import { type Manifest } from '../types';
import { verifyManifest } from './crypto';
import {
	getProviderToken,
	internalFetchManifest,
	RegistryProviderState,
} from './registry-providers/internal';
import { Err, Ok, Result } from './blocks/ts/result';
import * as persisted from './persisted';
import path from 'path';

interface SecureRegistryVerification {
	isSecure: boolean;
	isVerified: boolean;
	publicKeyUrl?: string;
	signature?: string;
}

const PUBLIC_KEY_PREFIX = 'public-key-';

export const savePublicKey = (repoUrl: RegistryProviderState, publicKey: string) => {
	const storage = persisted.get();
	const key = `${PUBLIC_KEY_PREFIX}${repoUrl.url}`;
	storage.set(key, publicKey);
};

export const loadPublicKey = (repoUrl: RegistryProviderState): string | undefined => {
	const storage = persisted.get();
	const key = `${PUBLIC_KEY_PREFIX}${repoUrl.url}`;
	return storage.get(key) as string | undefined;
};

export const fetchPublicKey = async (
	repoUrl: RegistryProviderState,
	keyPath: string
): Promise<Result<string, string>> => {
	console.log({ repoUrl, keyPath });
	const { provider } = repoUrl;

	if (!provider) {
		return Err('Invalid provider');
	}

	const token = getProviderToken(provider);

	const headers: Record<string, string> = {};

	if (token) {
		switch (provider.name) {
			case 'github':
				headers['Authorization'] = `token ${token}`;
				break;
			case 'gitlab':
				headers['PRIVATE-TOKEN'] = token;
				break;
			case 'bitbucket':
				headers['Authorization'] = `Bearer ${token}`;
				break;
			case 'azure':
				headers['Authorization'] = `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
				break;
		}
	}

	try {
		const response = await nodeFetch(
			provider.name === 'http'
				? keyPath
				: `${await repoUrl.provider.resolveRaw(repoUrl, keyPath, '0.0.1')}`,
			{ headers }
		);

		if (!response.ok) {
			return Err(`Failed to fetch public key from ${repoUrl.url}: ${response.statusText}`);
		}

		const publicKey = await response.text();
		return Ok(publicKey);
	} catch (error) {
		return Err(`Failed to fetch public key from ${repoUrl}: ${(error as Error).message}`);
	}
};

export const verifySecureRegistry = async (
	repoUrl: RegistryProviderState,
	manifest: Manifest
): Promise<SecureRegistryVerification> => {
	// If no signature in manifest metadata, it's not a secure registry
	if (!manifest.meta?.signature) {
		return { isSecure: false, isVerified: false };
	}

	// Get the provider state

	// Fetch both origin (0.0.1) and latest manifests
	const originManifest = (await internalFetchManifest(repoUrl, undefined, '0.0.1')).match(
		(manifest) => manifest,
		(error) => program.error(color.red(`Failed to fetch origin manifest from ${repoUrl.url}`))
	);

	// If origin manifest has no signature, something is wrong
	if (!originManifest.meta?.signature) {
		program.error(color.red(`Origin manifest from ${repoUrl.url} is missing signature`));
	}

	// Try to load cached public key
	let publicKey = loadPublicKey(repoUrl);

	// If no cached key but URL provided, try to fetch it
	const publicKeyUrl =
		manifest.meta.publicKeyUrl ||
		originManifest.meta.publicKeyUrl ||
		path.join('.jsrepo', 'public.pem');
	if (!publicKey) {
		const fetchResult = await fetchPublicKey(repoUrl, publicKeyUrl);
		fetchResult.match(
			(key) => {
				publicKey = key;
				savePublicKey(repoUrl, key);
			},
			(error) => {
				console.error(color.red(error));
			}
		);
	}

	if (!publicKey) {
		return {
			isSecure: true,
			isVerified: false,
			publicKeyUrl,
			signature: manifest.meta.signature,
		};
	}

	// Verify both origin and latest manifests
	const originMeta = {
		...originManifest.meta,
		signature: undefined,
		isOrigin: undefined,
	};

	const latestMeta = {
		...manifest.meta,
		signature: undefined,
		isOrigin: undefined,
	};

	const originVerified = verifyManifest(
		JSON.stringify(
			{
				...originManifest,
				meta:
					originMeta && Object.values(originMeta).filter(Boolean).length
						? originMeta
						: undefined,
			},
			null,
			2
		),
		originManifest.meta.signature,
		publicKey
	);

	const latestVerified = verifyManifest(
		JSON.stringify(
			{
				...manifest,
				meta:
					latestMeta && Object.values(latestMeta).filter(Boolean).length
						? latestMeta
						: undefined,
			},
			null,
			2
		),
		manifest.meta.signature,
		publicKey
	);

	const isVerified = originVerified && latestVerified;

	return {
		isSecure: true,
		isVerified,
		publicKeyUrl,
		signature: manifest.meta.signature,
	};
};
