import { z } from "zod";
import RequestData from "../lib/RequestData";
import RequestError from "../error";
import { HttpStatus } from "../status";
import { Match, Profile } from "../lib/database/types";
import Database from "../lib/Database";

const bodySchema = z.object({
	target: z.string().uuid(),
});

type Body = z.infer<typeof bodySchema>;

export async function post(req: RequestData): Promise<void> {
	const contact = await req.getContact();
	const body = await req.getBody<Body>(bodySchema);

	const db = await Database.getCachedInterface(req.env);
	await db.like(contact.id, body.target);
	db.close(req.ctx);
}

export async function del(req: RequestData): Promise<{ matches: Match[] }> {
	const target = req.searchParams.get('target');
	if (target == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing target');

	const contact = await req.getContact();
	const db = await Database.getCachedInterface(req.env);
	await db.likesDelete(contact.id, target);
	await db.messagesDeleteBetween(contact.id, target);
	const res = await db.matchesGet(contact.id);
	db.close(req.ctx);

	return { matches: res };
}
