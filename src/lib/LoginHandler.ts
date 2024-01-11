import { Env } from "..";
import RequestError from "../error";
import { HttpStatus } from "../status";
import { EncodableObject, urlEncodeObject } from "./encoding";

const codeRegex = /^\d{6}$/;
const phoneRegex = /^\+[1-9]\d{1,14}$/;
const twilioApi = 'https://verify.twilio.com/v2';

type TwilioLookupResponse = {
	valid: boolean,
};

type TwilioVerifyResponse = {
	status: 'pending' | 'approved' | 'canceled',
};

const initialCooldownMillis = 1000;

export default class LoginHandler {
	private _acctSid: string;
	private _auth: string;
	private _verifySid: string;

	private constructor(acctSid: string, auth: string, verifySid: string) {
		this._acctSid = acctSid;
		this._auth = auth;
		this._verifySid = verifySid;
	}

	async sendLoginCode(phone: string, channel: 'sms' | 'whatsapp'): Promise<void> {
		if (!phoneRegex.test(phone)) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid phone number format');
		const lookupRequest = await fetch(`https://lookups.twilio.com/v2/PhoneNumbers/${phone}`, {
			headers: { 'Authorization': this.getAuthHeader() },
		});

		if (lookupRequest.ok) {
			const lookupResponse = await lookupRequest.json() as TwilioLookupResponse;
			if (!lookupResponse.valid) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid phone number');
		} else {
			// If Twilio's lookup API fails, log the error
			// but still try to verify the phone number in
			// case this is only a partial failure on Twilio's
			// side.
			const text = await lookupRequest.text();
			console.error(`Twilio lookup failed: ${lookupRequest.status} ${lookupRequest.statusText}\n${text}`);
		}

		const body = {
			To: phone,
			Channel: channel,
		};

		const req = await this.doRequest(`/Services/${this._verifySid}/Verifications`, body);
		if (!req.ok) {
			const text = await req.text();
			console.error(`Twilio error: ${req.status} ${req.statusText}\n${text}`);
			LoginHandler._errorLock();
			throw new RequestError(HttpStatus.ServiceUnavailable, 'Verification service is unavailable');
		}

		LoginHandler._currentCooldownMillis = initialCooldownMillis;
	}

	async verifyLoginCode(phone: string, code: string): Promise<boolean> {
		if (!phoneRegex.test(phone)) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid phone number format');
		if (!codeRegex.test(code)) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid code format');

		const body = {
			Code: code,
			To: phone,
		};

		const req = await this.doRequest(`/Services/${this._verifySid}/VerificationCheck`, body);
		if (!req.ok && req.status != HttpStatus.NotFound) {
			const text = await req.text();
			console.error(`Twilio error: ${req.status} ${req.statusText}\n${text}`);
			LoginHandler._errorLock();
			throw new RequestError(HttpStatus.ServiceUnavailable, 'Verification service is unavailable');
		} else if (req.status == HttpStatus.NotFound) {
			return false;
		}

		const res = await req.json<TwilioVerifyResponse>();
		console.dir(res);
		LoginHandler._currentCooldownMillis = initialCooldownMillis;
		return res.status == 'approved';
	}

	private async doRequest(endpoint: string, body: EncodableObject): Promise<Response> {
		return fetch(twilioApi + endpoint, {
			body: urlEncodeObject(body),
			headers: { 'Authorization': this.getAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
			method: 'POST',
		});
	}

	private getAuthHeader(): string {
		const auth = btoa(`${this._acctSid}:${this._auth}`);
		return `Basic ${auth}`;
	}

	private static _currentCooldownMillis = initialCooldownMillis;
	private static _lockedUntil = Date.now();

	static getHandler(env: Env): LoginHandler {
		if (Date.now() < this._lockedUntil) throw new RequestError(HttpStatus.ServiceUnavailable);
		return new LoginHandler(env.TWILIO_ACCT_SID, env.TWILIO_AUTH, env.TWILIO_VERIFY_SID);
	}

	private static _errorLock(): void {
		this._lockedUntil = Date.now() + this._currentCooldownMillis;
		this._currentCooldownMillis = Math.min(this._currentCooldownMillis * 2, 3.6e6);
	}
}
