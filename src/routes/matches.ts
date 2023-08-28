import RequestError from "../error";
import Database from "../lib/Database";
import RequestData from "../lib/RequestData";
import { Match } from "../lib/database/types";

export async function get(req: RequestData): Promise<{ matches: Match[] }> {
	const contact = await req.getContact();
	const db = await Database.getCachedInterface(req.env);
	const matches = await db.matchesGet(contact.id);
	return { matches };
}
