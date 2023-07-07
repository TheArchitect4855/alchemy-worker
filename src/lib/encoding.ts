export type EncodableObject = { [key: string]: string };

const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64Encode(s: string): string {
	return base64EncodeBuffer(encoder.encode(s));
}

export function base64EncodeBuffer(buffer: Uint8Array): string {
	const hexets = new Uint8Array(Math.ceil(buffer.length * 4 / 3));
	for (let i = 0; i < hexets.length / 4; i += 1) {
		hexets[i * 4] = (buffer[i * 3] & 0b11111100) >> 2;
		hexets[i * 4 + 1] = ((buffer[i * 3] & 0b00000011) << 4) | ((buffer[i * 3 + 1] & 0b11110000) >> 4);
		hexets[i * 4 + 2] = ((buffer[i * 3 + 1] & 0b00001111) << 2) | ((buffer[i * 3 + 2] & 0b11000000) >> 6);
		hexets[i * 4 + 3] = (buffer[i * 3 + 2] & 0b00111111);
	}

	let str = '';
	for (const h of hexets) str += base64.charAt(h);
	return str;
}

export function base64Decode(s: string): string {
	return decoder.decode(base64DecodeBuffer(s));
}

export function base64DecodeBuffer(s: string): Uint8Array {
	if (!/^[0-9a-zA-Z_-]+$/.test(s)) throw new Error('invalid base64 string');

	const hexets = [];
	for (const c of s) hexets.push(base64.indexOf(c));

	const res = new Uint8Array(Math.floor(s.length * 3 / 4));
	for (let i = 0; i < hexets.length / 4; i += 1) {
		res[i * 3] = ((hexets[i * 4] & 0b111111) << 2) | ((hexets[i * 4 + 1] & 0b110000) >> 4);
		res[i * 3 + 1] = ((hexets[i * 4 + 1] & 0b001111) << 4) | ((hexets[i * 4 + 2] & 0b111100) >> 2);
		res[i * 3 + 2] = ((hexets[i * 4 + 2] & 0b000011) << 6) | (hexets[i * 4 + 3] & 0b111111);
	}

	return res;
}

export function hexDecodeBuffer(hex: string): Uint8Array {
	if (hex.length % 2 != 0 || !/^[0-9a-fA-F]+$/.test(hex)) throw new Error('invalid hex string');

	const res = new Uint8Array(hex.length / 2);
	for (let i = 0; i < res.length; i += 1) {
		const pair = hex.substring(i * 2, i * 2 + 2);
		res[i] = parseInt(pair, 16);
	}

	return res;
}

export function urlEncodeObject(obj: EncodableObject): string {
	const values = [];
	for (const k in obj) values.push(`${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`);
	return values.join('&');
}
