import { Env } from "..";
import { base64Decode, base64DecodeBuffer, base64Encode, base64EncodeBuffer, hexDecodeBuffer } from "./encoding";

const jwtHeader = {
	'alg': 'HMAC',
	'typ': 'JWT',
};

export async function create(payload: any, env: Env): Promise<string> {
	const token = `${base64Encode(JSON.stringify(jwtHeader))}.${base64Encode(JSON.stringify(payload))}`;
	const key = await getKey(env);
	const encoder = new TextEncoder();
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(token));
	return `${token}.${base64EncodeBuffer(new Uint8Array(signature))}`
}

// There's no need to throw anything from this function, because if something
// goes wrong that means the JWT is invalid (i.e. we should return null)
export async function verify(jwt: string, env: Env): Promise<any | null> {
	const parts = jwt.split('.');
	if (parts.length != 3) return null;

	try {
		const header = JSON.parse(base64Decode(parts[0])) as typeof jwtHeader;
		if (header.alg != jwtHeader.alg || header.typ != jwtHeader.typ) return null;
	} catch (e) {
		console.log(`JWT verify failed parsing header: ${e}`);
		return null;
	}

	const token = parts.slice(0, 2).join('.');
	const key = await getKey(env);
	const encoder = new TextEncoder();
	try {
		const isValid = await crypto.subtle.verify('HMAC', key, base64DecodeBuffer(parts[2]), encoder.encode(token));
		if (!isValid) return null;
	} catch (e) {
		console.log(`JWT verify failed verifying signature: ${e}`);
		return null;
	}

	try {
		const payload = JSON.parse(base64Decode(parts[1]));
		return payload;
	} catch (e) {
		console.log(`JWT verify failed parsing payload: ${e}`);
		return null;
	}
}

function getKey(env: Env): Promise<CryptoKey> {
	const raw = hexDecodeBuffer(env.JWT_KEY_HEX);
	return crypto.subtle.importKey('raw', raw, {
		name: 'hmac',
		hash: 'SHA-512',
	}, false, [ 'sign', 'verify' ]);
}
