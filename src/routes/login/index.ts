import RequestError from "../../error";
import Database from "../../lib/Database";
import LoginHandler from "../../lib/LoginHandler";
import RequestData from "../../lib/RequestData";
import { Duration } from "../../lib/time";
import { HttpStatus } from "../../status";
import { z } from "zod";
import * as jwt from '../../lib/jwt';

const postSchema = z.object({
	code: z.string(),
	phone: z.string(),
});

type Post = z.infer<typeof postSchema>;

export async function post(req: RequestData): Promise<{ token: string }> {
	const body = await req.getBody<Post>(postSchema);
	const handler = LoginHandler.getHandler(req.env);
	const valid = (body.phone === req.env.DEBUG_PHONE) || (await handler.verifyLoginCode(body.phone, body.code)); // Debug phone is automatically valid
	if (valid !== true) throw new RequestError(HttpStatus.NotFound, 'Invalid login code');

	const db = await Database.getCachedInterface(req.env);
	const contact = await db.contactGetByPhone(body.phone);
	db.close(req.ctx);

	if (contact == null) {
		const payload = {
			exp: Math.floor(Date.now() + Duration.hours(1).asMilliseconds()),
			phn: body.phone,
		};

		const token = await jwt.create(payload, req.env);
		return { token };
	}

	if (contact.isRedlisted) throw new RequestError(HttpStatus.Forbidden, 'Contact is redlisted');

	const age = Math.floor(Duration.between(new Date(), contact.dob).asYears());
	if (age < 18) throw new RequestError(HttpStatus.Forbidden, 'Contact age is under 18');

	const token = await jwt.createSessionToken(Duration.days(30), contact.id, contact.phone, contact.dob, contact.isRedlisted, contact.tosAgreed, req.env);
	return { token };
}

export async function get(req: RequestData): Promise<void> {
	const phone = req.searchParams.get('phone');
	const channel = req.searchParams.get('channel');
	if (phone == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing phone field');
	if (channel == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing channel field');
	if (channel != 'sms' && channel != 'whatsapp') throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid channel');
	if (phone == req.env.DEBUG_PHONE) return; // Allow debug user through

	const handler = LoginHandler.getHandler(req.env);
	await handler.sendLoginCode(phone, channel);
}
