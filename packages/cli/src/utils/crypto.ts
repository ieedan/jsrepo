import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'pathe';

export interface KeyPair {
	publicKey: string;
	privateKey: string;
}

export interface SignedManifest {
	manifest: string;
	signature: string;
	isOrigin: boolean;
}

/**
 * Generates a new RSA key pair for secure registry signing
 * @returns Promise<KeyPair> The generated public and private keys
 */
export const generateKeyPair = (): Promise<KeyPair> => {
	return new Promise((resolve, reject) => {
		crypto.generateKeyPair(
			'rsa',
			{
				modulusLength: 4096,
				publicKeyEncoding: {
					type: 'spki',
					format: 'pem',
				},
				privateKeyEncoding: {
					type: 'pkcs8',
					format: 'pem',
				},
			},
			(err, publicKey, privateKey) => {
				if (err) {
					reject(err);
					return;
				}
				resolve({ publicKey, privateKey });
			}
		);
	});
};

/**
 * Signs a manifest with the private key
 * @param manifest The manifest content to sign
 * @param privateKey The private key to sign with
 * @returns The signature for the manifest
 */
const sortObjectKeys = (obj: any): any => {
	if (Array.isArray(obj)) {
		return obj.map(sortObjectKeys);
	} else if (typeof obj === 'object' && obj !== null) {
		const sortedObj: any = {};
		Object.keys(obj)
			.sort()
			.forEach((key) => {
				sortedObj[key] = sortObjectKeys(obj[key]);
			});
		return sortedObj;
	}
	return obj;
};

export const signManifest = (manifest: string, privateKey: string): string => {
	const parsedManifest = JSON.parse(manifest);
	const sortedManifest = sortObjectKeys(parsedManifest);
	const normalizedManifest = JSON.stringify(sortedManifest);
	const sign = crypto.createSign('SHA256');
	sign.write(normalizedManifest);
	sign.end();
	return sign.sign(privateKey, 'base64');
};

/**
 * Verifies a manifest signature using the public key
 * @param manifest The manifest content to verify
 * @param signature The signature to verify against
 * @param publicKey The public key to verify with
 * @returns boolean Whether the signature is valid
 */
export const verifyManifest = (manifest: string, signature: string, publicKey: string): boolean => {
	const parsedManifest = JSON.parse(manifest);
	const sortedManifest = sortObjectKeys(parsedManifest);
	const normalizedManifest = JSON.stringify(sortedManifest);
	const verify = crypto.createVerify('SHA256');
	verify.write(normalizedManifest);
	verify.end();
	return verify.verify(publicKey, signature, 'base64');
};

/**
 * Saves registry keys to the specified directory
 * @param keyPair The key pair to save
 * @param directory The directory to save the keys in
 */
export const saveRegistryKeys = (keyPair: KeyPair, directory: string) => {
	const keysDir = path.join(directory, '.jsrepo');
	const gitignorePath = path.join(directory, '.gitignore');

	// Create .jsrepo directory if it doesn't exist
	if (!fs.existsSync(keysDir)) {
		fs.mkdirSync(keysDir, { recursive: true });
	}

	// Handle .gitignore file
	const gitignoreEntry = 'private.pem';
	if (fs.existsSync(gitignorePath)) {
		const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
		const lines = gitignoreContent.split('\n');
		const entryExists = lines.some((line) => line.trim() === gitignoreEntry);
		if (!entryExists) {
			fs.appendFileSync(gitignorePath, `\n${gitignoreEntry}\n`);
		}
	} else {
		fs.writeFileSync(gitignorePath, `${gitignoreEntry}\n`);
	}

	fs.writeFileSync(path.join(keysDir, 'public.pem'), keyPair.publicKey);
	fs.writeFileSync(path.join(keysDir, 'private.pem'), keyPair.privateKey);

	return {
		publicKey: path.join(keysDir, 'public.pem'),
		privateKey: path.join(keysDir, 'private.pem'),
	};
};

/**
 * Loads registry keys from the specified directory
 * @param directory The directory to load the keys from
 * @returns KeyPair | null The loaded keys or null if not found
 */
export const loadRegistryKeys = (directory: string): KeyPair | null => {
	const keysDir = path.join(directory, '.jsrepo');
	const publicKeyPath = path.join(keysDir, 'public.pem');
	const privateKeyPath = path.join(keysDir, 'private.pem');

	if (!fs.existsSync(publicKeyPath) || !fs.existsSync(privateKeyPath)) {
		return null;
	}

	return {
		publicKey: fs.readFileSync(publicKeyPath, 'utf8'),
		privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
	};
};
