import { Env } from "../..";
import Database from "../Database";
import { NotificationConfig } from "../database/types";
import FirebaseNotificationProvider from "./firebase/FirebaseNotificationProvider";
import TwilioNotificationProvider from "./TwilioNotificationProvider";

const notificationCooldownMillis = 3e5;
const twilioTokenRegex = /^\+\d+$/;

export type NotificationInfo = {
	notificationData?: {
		title: string,
		body: string,
		image?: string,
	}
	messageData?: { [key: string]: string },
};

export type NotificationSendResult = {
	status: 'OK' | 'TOKEN_INVALID' | 'UNSUPPORTED',
};

export interface NotificationProvider {
	send(token: string, notification: NotificationInfo): Promise<NotificationSendResult>;
}

export default class NotificationHandler {
	private readonly _allowNotificationsCache: { [contact: string]: boolean };
	private readonly _cfgCache: { [contact: string]: NotificationConfig | null };
	private readonly _db: Database;
	private readonly _env: Env;

	constructor(env: Env) {
		this._allowNotificationsCache = {};
		this._cfgCache = {};
		this._db = env.rawDatabase;
		this._env = env;
	}

	async canSendNotificationsTo(contact: string): Promise<boolean> {
		const cfg = await this.getConfigFor(contact);
		return cfg != null;
	}

	async sendNotificationTo(contact: string, info: NotificationInfo): Promise<void> {
		if (info.messageData == undefined && info.notificationData == undefined) throw new Error('info must have one of messageData or notificationData');

		const canSend = await this.canSendNotificationsTo(contact);
		if (!canSend) throw new Error(`cannot send notifications to ${contact}`);

		const cfg = this._cfgCache[contact] as NotificationConfig;
		const token = cfg.token;
		let provider: NotificationProvider;
		if (twilioTokenRegex.test(token)) provider = new TwilioNotificationProvider(this._env);
		else provider = new FirebaseNotificationProvider(this._env);

		const res = await provider.send(token, info);
		switch (res.status) {
			case 'OK':
				cfg.lastNotificationAt = new Date();
				await this._db.notificationConfigUpdateLastSent(contact);
				break;
			case 'TOKEN_INVALID':
				delete this._cfgCache[contact];
				await this._db.notificationConfigDelete(contact);
				break;
			case 'UNSUPPORTED':
				console.warn(`Operation unsupported on ${provider}:\n${JSON.stringify(info)}`);
				break;
		}
	}

	async shouldSendNotificationsTo(contact: string): Promise<boolean> {
		const canSend = await this.canSendNotificationsTo(contact);
		if (!canSend) return false;

		const cfg = this._cfgCache[contact] as NotificationConfig;
		const lastNotificationAt = cfg.lastNotificationAt;
		if (lastNotificationAt != null && Date.now() - lastNotificationAt.getTime() < notificationCooldownMillis) return false;

		return this.getAllowNotificationsFor(contact);
	}

	private async getAllowNotificationsFor(contact: string): Promise<boolean> {
		if (this._allowNotificationsCache[contact] !== undefined) return this._allowNotificationsCache[contact];

		const prefs = await this._db.preferencesGet(contact);
		this._allowNotificationsCache[contact] = prefs.allowNotifications;
		return prefs.allowNotifications;
	}

	private async getConfigFor(contact: string): Promise<NotificationConfig | null> {
		if (this._cfgCache[contact] === undefined) this._cfgCache[contact] = await this._db.notificationConfigGet(contact);
		return this._cfgCache[contact];
	}
}
