import { z } from "zod";
import Database from "../lib/Database";
import RequestData from "../lib/RequestData";
import { Preferences } from "../lib/database/types";

const putSchema = z.object({
	allowNotifications: z.boolean(),
	showTransgender: z.boolean(),
	genderInterests: z.array(z.enum([ 'men', 'nonbinary', 'women' ])),
});

export async function get(req: RequestData): Promise<Preferences> {
	const contact = await req.getContact();
	const db = await Database.getCachedInterface(req.env);
	const res = await db.preferencesGet(contact.id);
	db.close(req.ctx);

	if (res == null) return {
		allowNotifications: true,
		showTransgender: true,
		genderInterests: [ 'men', 'nonbinary', 'women' ],
	};

	return res;
}

export async function put(req: RequestData): Promise<void> {
	const body = await req.getBody<Preferences>(putSchema);
	const contact = await req.getContact();

	const db = await Database.getCachedInterface(req.env);
	await db.preferencesSet(contact.id, body);
	db.close(req.ctx);
}
