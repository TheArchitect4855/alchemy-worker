import { Env } from "../../..";
import { base64Decode } from "../../encoding";
import { NotificationInfo, NotificationProvider, NotificationSendResult } from "../NotificationHandler";
import { getToken } from "./auth";
import { ServiceAccount, StringMap, TokenPayload } from "./types";

const authTokenCacheKey = 'firebase-token-messaging';

export class MessagingError {
	readonly message: string;

	constructor(message: string) {
		this.message = message;
	}

	toString(): string {
		return `Messaging Error: ${this.message}`;
	}

	static fromErrorResponse(response: any): MessagingError {
		const err = response.error;
		return new MessagingServerError(err.code, err.message, err.status, err.details);
	}
}

export class MessagingServerError extends MessagingError {
	readonly code: number;
	readonly status: string;
	readonly details: StringMap[];

	constructor(code: number, message: string, status: string, details: StringMap[]) {
		super(message);
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

export default class FirebaseNotificationProvider implements NotificationProvider {
	private readonly _env: Env;
	private readonly _projectId: string;
	private _token: string | null;

	constructor(env: Env) {
		const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
		this._env = env;
		this._projectId = sa.project_id;
		this._token = null;
	}

	async send(token: string, notification: NotificationInfo): Promise<NotificationSendResult> {
		const fcmToken = await this.getToken();
		const body = {
			message: {
				data: notification.messageData,
				notification: notification.notificationData,
				token: token,
			},
		};

		const req = await fetch(`https://fcm.googleapis.com/v1/projects/${this._projectId}/messages:send`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${fcmToken}`,
			},
			body: JSON.stringify(body),
		});

		const res = await req.json() as any;
		if (res.error?.status === 'INVALID_ARGUMENT') {
			// FCM token is invalid
			return {
				status: 'TOKEN_INVALID',
			};
		}

		if (res.error) throw MessagingError.fromErrorResponse(res);
		return {
			status: 'OK',
		};
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

		const tokenPayload = JSON.parse(base64Decode(token.split('.')[1])) as TokenPayload;
		await this._env.KV_CACHE.put(authTokenCacheKey, token, {
			expiration: tokenPayload.exp,
		});

		return token;
	}
}
