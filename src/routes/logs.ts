import { z } from "zod";
import RequestData from "../lib/RequestData";
import RequestError from "../error";
import { HttpStatus } from "../status";
import { base64DecodeBuffer, hexDecodeBuffer } from "../lib/encoding";
import Database from "../lib/Database";
import { Contact } from "../lib/database/types";

type LogStatus = {
	logsRequested: boolean;
};

const paramsSchema = z.object({
	id: z.string(),
	signature: z.string(),
	timestamp: z.string().regex(/^\d+$/),
});

type Params = z.infer<typeof paramsSchema>;

export async function post(req: RequestData): Promise<void> {
	const { id, signature, timestamp } =
		req.getSearchParams<Params>(paramsSchema);
	const ts = parseInt(timestamp);
	const now = Date.now() / 1000;
	if (Math.abs(now - ts) > 1) throw new RequestError(HttpStatus.Forbidden);

	await validate(id, signature, timestamp, req.env.LOG_SECRET_HEX);

	const logKey = await req.uploadBody(req.env.R2_LOGS, 1e6);
	let contact: Contact | null;
	try {
		contact = await req.getContact();
	} catch {
		contact = null;
	}

	const db = await Database.getInterface(req.env);
	await db.userLogCreate(id, logKey, contact?.id ?? null);
	db.close(req.ctx);
}

export async function get(req: RequestData): Promise<LogStatus> {
	const { id, signature, timestamp } =
		req.getSearchParams<Params>(paramsSchema);
	const ts = parseInt(timestamp);
	const now = Date.now() / 1000;
	if (Math.abs(now - ts) > 1) throw new RequestError(HttpStatus.Forbidden);

	await validate(id, signature, timestamp, req.env.LOG_SECRET_HEX);

	const db = await Database.getInterface(req.env);
	const logRequest = await db.requestGet(id, "logs");
	db.close(req.ctx);

	return {
		logsRequested: logRequest != null,
	};
}

async function validate(id: string, signature: string, timestamp: string, key: string): Promise<void> {
	const k = await crypto.subtle.importKey('raw', hexDecodeBuffer(key), {
		name: 'hmac',
		hash: 'SHA-512',
	}, false, [ 'verify' ]);

	const encoder = new TextEncoder();
	const payload = `${id}.${timestamp}`;
	const isValid = await crypto.subtle.verify(
		"HMAC",
		k,
		base64DecodeBuffer(signature),
		encoder.encode(payload)
	);

	if (!isValid) {
		console.log(`Signature failed validation: ${signature} ${payload}`);
		throw new RequestError(HttpStatus.Forbidden);
	}
}
