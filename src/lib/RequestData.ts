import { ZodError, ZodType, z } from "zod";
import { Env } from "..";
import RequestError from "../error";
import { HttpStatus } from "../status";
import * as jwt from './jwt';
import { Contact } from "./database/types";

export default class RequestData {
	readonly req: Request;
	readonly url: URL;
	readonly env: Env;
	readonly ctx: ExecutionContext;

	constructor(req: Request, url: URL, env: Env, ctx: ExecutionContext) {
		this.req = req;
		this.url = url;
		this.env = env;
		this.ctx = ctx;
	}

	async getBody<T>(schema: ZodType): Promise<T> {
		try {
			const body = await this.req.json();
			return schema.parse(body);
		} catch (e) {
			if (e instanceof ZodError) {
				const msg = getZodErrorMessage(e);
				throw new RequestError(HttpStatus.UnprocessableEntity, msg);
			} else {
				throw new RequestError(HttpStatus.BadRequest, 'Invalid JSON body');
			}
		}
	}

	async getContact(): Promise<Contact> {
		const payload = await this.getJwtPayload();
		if (payload.sub == null) throw new RequestError(HttpStatus.Forbidden, 'Missing contact');

		const [ isRedlisted, tosAgreed ] = payload.flg.split('').map((e: string) => e == '1');
		return {
			id: payload.sub,
			phone: payload.phn,
			dob: new Date(payload.dob),
			isRedlisted,
			tosAgreed,
		};
	}

	getHeader(header: string): string | null {
		return this.req.headers.get(header);
	}

	async getPhone(): Promise<string> {
		const payload = await this.getJwtPayload();
		return payload.phn;
	}

	async uploadBody(bucket: R2Bucket, maxSizeBytes: number): Promise<string> {
		const contentLength = this.getHeader('Content-Length');
		if (contentLength == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing Content-Length header');

		const len = parseInt(contentLength);
		if (isNaN(len)) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid Content-Length header');
		if (len > maxSizeBytes) throw new RequestError(HttpStatus.PayloadTooLarge, `Maximum body size of ${maxSizeBytes}B exceeded`);

		const key = crypto.randomUUID();
		await bucket.put(key, this.req.body);
		return key;
	}

	get searchParams(): URLSearchParams { return this.url.searchParams; }

	private async getJwtPayload(): Promise<any> {
		const authorization = this.getHeader('Authorization');
		const bearer = 'Bearer ';
		if (!authorization?.startsWith(bearer)) throw new RequestError(HttpStatus.Unauthorized, 'Invalid Authorization header (must be Bearer)');
		const token = authorization.substring(bearer.length);
		const payload = await jwt.verify(token, this.env);
		if (payload == null || payload.exp < Date.now()) throw new RequestError(HttpStatus.Unauthorized, 'Invalid JWT');
		return payload;
	}
}

function getZodErrorMessage(e: ZodError): string {
	let res = 'Schema failed validation:';
	for (const msg of e.errors) {
		res += `\n\t${msg.message} for ${msg.path.join('.')}`;
	}

	return res;
}
