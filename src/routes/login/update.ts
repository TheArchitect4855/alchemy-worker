import Database from "../../lib/Database";
import RequestData from "../../lib/RequestData";
import { Contact } from "../../lib/database/types";
import { Duration } from "../../lib/time";
import * as jwt from '../../lib/jwt';

export async function get(req: RequestData): Promise<{ token: string }> {
	let contact = await req.getContact();
	const db = await Database.getCachedInterface(req.env);
	contact = await db.contactGet(contact.id) as Contact;
	db.close(req.ctx);

	const flags = [ contact.isRedlisted, contact.tosAgreed ].map((e) => e ? '1' : '0').join('');
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
