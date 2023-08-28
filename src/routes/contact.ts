import { z } from "zod";
import RequestError from "../error";
import Database from "../lib/Database";
import RequestData from "../lib/RequestData";
import { HttpStatus } from "../status";
import { Duration } from "../lib/time";
import { DatabaseError, DatabaseErrorKind } from "../lib/database/dbi";
import * as jwt from '../lib/jwt';

const postSchema = z.object({
	dob: z.string().datetime(),
});

const putSchema = z.object({
	agreeTos: z.boolean(),
});

type Post = z.infer<typeof postSchema>;
type Put = z.infer<typeof putSchema>;

export async function post(req: RequestData): Promise<{ token: string }> {
	const phone = await req.getPhone();
	const body = await req.getBody<Post>(postSchema);
	const dob = new Date(body.dob);
	const age = Math.floor(Duration.between(new Date(), dob).asYears());
	const isRedlisted = age < 18;
	const db = req.env.cachedDatabase;
	let id;
	try {
		id = await db.contactCreate(phone, dob, isRedlisted);
	} catch (e: any) {
		if (e instanceof DatabaseError && e.kind == DatabaseErrorKind.DuplicateKey) {
			throw new RequestError(HttpStatus.Forbidden, 'Contact already exists');
		}

		throw e;
	}

	const token = await jwt.createSessionToken(Duration.days(30), id, phone, dob, isRedlisted, false, req.env);
	return { token };
}

export async function put(req: RequestData): Promise<{ token: string }> {
	const contact = await req.getContact();
	const body = await req.getBody<Put>(putSchema);
	if (!body.agreeTos) {
		// TODO: Handle revocation of TOS agreement
		throw new RequestError(HttpStatus.NotImplemented);
	}

	const conn = req.env.cachedDatabase;
	await conn.contactSetAgreeTos(contact.id, body.agreeTos);
	const token = await jwt.createSessionToken(Duration.days(30), contact.id, contact.phone, contact.dob, contact.isRedlisted, body.agreeTos, req.env);
	return { token };
}
