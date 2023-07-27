import { z } from "zod";
import RequestData from "../lib/RequestData";
import RequestError from "../error";
import { HttpStatus } from "../status";
import { Match, NotificationConfig, Profile } from "../lib/database/types";
import Database from "../lib/Database";
import Messaging from "../lib/firebase/Messaging";

const matchNotificationType = 'new-match';

const bodySchema = z.object({
	target: z.string().uuid(),
});

type Body = z.infer<typeof bodySchema>;

export async function post(req: RequestData): Promise<{ match: Match | null }> {
	const contact = await req.getContact();
	const body = await req.getBody<Body>(bodySchema);

	const db = await Database.getCachedInterface(req.env);
	await db.like(contact.id, body.target);
	
	const match = await db.matchGet(contact.id, body.target);
	if (match != null) await sendMatchNotification(body.target, new Messaging(req.env, db));

	db.close(req.ctx);
	return { match };
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

async function sendMatchNotification(to: string, messaging: Messaging): Promise<void> {
	const shouldSendNotification = await messaging.shouldSendNotifications(to, matchNotificationType);
	if (!shouldSendNotification) return;
	
	const cfg = await messaging.getNotificationConfigFor(to) as NotificationConfig;
	await messaging.send(to, {
		token: cfg.token,
		notification: {
			title: 'Someone matched with you!',
			body: 'See who it is!',
		},
	});

	await messaging.addPendingNotificationType(to, matchNotificationType);
}
