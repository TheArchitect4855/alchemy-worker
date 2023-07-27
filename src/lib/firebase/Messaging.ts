import { Env } from "../..";
import Database from "../Database";
import { NotificationConfig, Preferences } from "../database/types";
import { base64Decode } from "../encoding";
import { getToken } from "./auth";
import { Message, ServiceAccount, StringMap, TokenPayload } from './types';

const authTokenCacheKey = 'firebase-token-messaging';

export default class Messaging {
	private readonly _env: Env;
	private readonly _db: Database;
	private readonly _projectId: string;
	private _token: string | null;
	private _tokenPayload: TokenPayload | null;
	private _configCache: { [contact: string]: NotificationConfig | null };
	private _allowNotificationsCache: { [contact: string]: boolean };

	constructor(env: Env, db: Database) {
		const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
		this._env = env;
		this._db = db;
		this._projectId = sa.project_id;
		this._token = null;
		this._tokenPayload = null;
		this._configCache = {};
		this._allowNotificationsCache = {};
	}

	async addPendingNotificationType(contact: string, type: string): Promise<void> {
		const cfg = await this.getNotificationConfigFor(contact);
		if (cfg == null) throw new MessagingError('no config for contact');
		cfg.pendingNotificationTypes.push(type);
		await this._db.notificationConfigUpdate(contact, cfg.token, cfg.pendingNotificationTypes);
	}

	async canSendNotifications(to: string): Promise<boolean> {
		if (this._configCache[to] === undefined) {
			const cfg = await this._db.notificationConfigGet(to);
			this._configCache[to] = cfg;
		}

		const config = this._configCache[to];
		return config != null;
	}

	async getNotificationConfigFor(contact: string): Promise<NotificationConfig | null> {
		if (this._configCache[contact] === undefined) {
			this._configCache[contact] = await this._db.notificationConfigGet(contact);
		}

		return this._configCache[contact];
	}

	async shouldSendNotifications(to: string, type: string): Promise<boolean> {
		const canSend = await this.canSendNotifications(to);
		if (!canSend) return false;

		const config = this._configCache[to] as NotificationConfig;
		const idx = config.pendingNotificationTypes.indexOf(type);
		if (idx >= 0) return false;

		if (this._allowNotificationsCache[to] === undefined) {
			const prefs = await this._db.preferencesGet(to);
			this._allowNotificationsCache[to] = prefs.allowNotifications;
		}

		return this._allowNotificationsCache[to];
	}

	async send(contact: string, message: Message, opts?: { validateOnly?: boolean }): Promise<void> {
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
		if (res.error?.status === 'INVALID_ARGUMENT') {
			// FCM token is invalid
			await this._db.notificationConfigDelete(contact);
		}

		if (res.error) throw MessagingError.fromErrorResponse(res);
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
}

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
