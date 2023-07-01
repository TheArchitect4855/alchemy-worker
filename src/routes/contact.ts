import { z } from "zod";
import RequestError from "../error";
import Database from "../lib/Database";
import RequestData from "../lib/RequestData";
import { HttpStatus } from "../status";
import { Duration } from "../lib/time";
import { Contact } from "../lib/database/types";
import { DatabaseError, DatabaseErrorKind } from "../lib/database/dbi";

const postSchema = z.object({
	dob: z.string().datetime(),
});

const putSchema = z.object({
	agreeTos: z.boolean(),
});

type Post = z.infer<typeof postSchema>;
type Put = z.infer<typeof putSchema>;

export async function post(req: RequestData): Promise<Contact> {
	const phone = await req.getPhone();
	const body = await req.getBody<Post>(postSchema);
	const dob = new Date(body.dob);
	const age = Math.floor(Duration.between(new Date(), dob).asYears());
	const isRedlisted = age < 18;
	const db = await Database.getCachedInterface(req.env);
	let id;
	try {
		id = await db.contactCreate(phone, dob, isRedlisted);
	} catch (e: any) {
		if (e instanceof DatabaseError && e.kind == DatabaseErrorKind.DuplicateKey) {
			throw new RequestError(HttpStatus.Forbidden, 'Contact already exists');
		}

		throw e;
	} finally {
		db.close(req.ctx);
	}

	return {
		id,
		phone,
		dob,
		isRedlisted,
		tosAgreed: false,
	};
}

export async function put(req: RequestData): Promise<void> {
	const contact = await req.getContact();
	const body = await req.getBody<Put>(putSchema);
	if (!body.agreeTos) {
		// TODO: Handle revocation of TOS agreement
		throw new RequestError(HttpStatus.NotImplemented);
	}

	const conn = await Database.getCachedInterface(req.env);
	await conn.contactSetAgreeTos(contact.id, body.agreeTos);
	conn.close(req.ctx);
}
