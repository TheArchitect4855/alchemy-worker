import { Env } from "../..";
import RequestError from "../../error";
import { HttpStatus } from "../../status";
import { urlEncodeObject } from "../encoding";
import { NotificationInfo, NotificationProvider, NotificationSendResult } from "./NotificationHandler";

type TwilioErrorResponse = {
	code: number | null,
	message: string | null,
};

export default class TwilioNotificationProvider implements NotificationProvider {
	private readonly _auth: string;
	private readonly _baseUrl: string;
	private readonly _fromPhone: string;

	constructor(env: Env) {
		this._auth = 'Basic ' + btoa(`${env.TWILIO_ACCT_SID}:${env.TWILIO_AUTH}`);
		this._baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCT_SID}/Messages.json`;
		this._fromPhone = env.TWILIO_MESSAGING_PHN;
	}

	async send(token: string, notification: NotificationInfo): Promise<NotificationSendResult> {
		if (notification.notificationData == undefined) return { status: 'UNSUPPORTED' };
		const message = `${notification.notificationData.title}\n\n${notification.notificationData.body}\n\nhttps://web.usealchemy.app`;
		const body = urlEncodeObject({
			Body: message,
			From: this._fromPhone,
			To: token,
		});

		console.log(body);

		const res = await fetch(this._baseUrl, {
			body,
			method: 'POST',
			headers: {
				'Authorization': this._auth,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		});

		if (res.ok) return { status: 'OK' };

		if (res.status >= 400 && res.status < 500) {
			const body = await res.json() as TwilioErrorResponse;
			throw new Error(`Twilio returned ${res.status} ${res.statusText}: ${body.code} ${body.message}`);
		} else if (res.status >= 500) {
			throw new RequestError(HttpStatus.ServiceUnavailable, 'Notification service error');
		} else {
			throw new Error(`Unknown Twilio error: ${res.status} ${res.statusText}`);
		}
	}
}
