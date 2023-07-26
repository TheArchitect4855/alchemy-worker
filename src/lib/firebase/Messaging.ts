import { Env } from "../..";
import { base64Decode } from "../encoding";
import { getToken } from "./auth";
import { Message, ServiceAccount, StringMap, TokenPayload } from './types';

const authTokenCacheKey = 'firebase-token-messaging';

export default class Messaging {
	private readonly _env: Env;
	private readonly _projectId: string;
	private _token: string | null;
	private _tokenPayload: TokenPayload | null;

	constructor(env: Env) {
		const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
		this._env = env;
		this._projectId = sa.project_id;
		this._token = null;
		this._tokenPayload = null;
	}

	getCachedFcmToken(contactId: string): Promise<string | null> {
		return Messaging.getCachedFcmToken(this._env, contactId);
	}

	async send(message: Message, opts?: { validateOnly?: boolean }): Promise<any> {
		const token = await this.getToken();
		const body = {
			validate_only: opts?.validateOnly ?? false,
			message,
		};

		const req = await fetch(`https://fcm.googleapis.com/v1/projects/${this._projectId}/messages:send`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
			},
			body: JSON.stringify(body),
		});

		const res = await req.json() as any;
		if (res.error) throw MessagingError.fromErrorResponse(res);
		return res;
	}

	private async getToken(): Promise<string> {
		if (this._token != null) return this._token;

		const cached = await this._env.KV_CACHE.get(authTokenCacheKey);
		if (cached != null) {
			this._token = cached;
			return cached;
		}

		const token = await getToken(this._env, 'https://fcm.googleapis.com/');
		this._token = token;

		this._tokenPayload = JSON.parse(base64Decode(token.split('.')[1])) as TokenPayload;
		await this._env.KV_CACHE.put(authTokenCacheKey, token, {
			expiration: this._tokenPayload.exp,
		});

		return token;
	}

	static async cacheFcmToken(env: Env, contactId: string, token: string): Promise<void> {
		const key = getFcmTokenCacheKey(contactId);
		await env.KV_CACHE.put(key, token, {
			expirationTtl: 5259600, // 2 months
		});
	}

	static async deleteCachedFcmToken(env: Env, contactId: string): Promise<void> {
		const key = getFcmTokenCacheKey(contactId);
		await env.KV_CACHE.delete(key);
	}

	static async getCachedFcmToken(env: Env, contactId: string): Promise<string | null> {
		const key = getFcmTokenCacheKey(contactId);
		return await env.KV_CACHE.get(key);
	}
}

export class MessagingError {
	readonly code: number;
	readonly message: string;
	readonly status: string;
	readonly details: StringMap[];

	constructor(code: number, message: string, status: string, details: StringMap[]) {
		this.code = code;
		this.message = message;
		this.status = status;
		this.details = details;
	}

	toString(): string {
		return `Messaging Error: ${this.message}`;
	}

	static fromErrorResponse(response: any): MessagingError {
		const err = response.error;
		return new MessagingError(err.code, err.message, err.status, err.details);
	}
}

function getFcmTokenCacheKey(contactId: string): string {
	return `fcm-token-${contactId}`;
}
