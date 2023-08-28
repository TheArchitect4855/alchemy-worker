import Database from "../../lib/Database";
import RequestData from "../../lib/RequestData";
import { Duration } from "../../lib/time";
import * as jwt from "../../lib/jwt";
import RequestError from "../../error";
import { HttpStatus } from "../../status";

export async function get(req: RequestData): Promise<{ token: string }> {
	const session = await req.getJwtPayload();
	const db = await Database.getCachedInterface(req.env);
	let contact;
	if (session.sub == null && session.phn == null) {
		throw new RequestError(
			HttpStatus.UnprocessableEntity,
			"Invalid auth token"
		);
	} else if (session.sub == null) {
		// If there's no contact with the session, let's try to get one.
		contact = await db.contactGetByPhone(session.phn);
	} else {
		contact = await db.contactGet(session.sub);
	}

	if (contact == null)
		throw new RequestError(HttpStatus.NotFound, "Contact does not exist");
	const flags = [contact.isRedlisted, contact.tosAgreed]
		.map((e) => (e ? "1" : "0"))
		.join("");
	const payload = {
		exp: Math.floor(Date.now() + Duration.days(30).asMilliseconds()),
		sub: contact.id,
		phn: contact.phone,
		dob: contact.dob.getTime(),
		flg: flags,
	};

	const token = await jwt.create(payload, req.env);
	return { token };
}
