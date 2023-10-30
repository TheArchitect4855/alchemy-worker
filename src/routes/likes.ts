import { z } from "zod";
import RequestData from "../lib/RequestData";
import RequestError from "../error";
import { HttpStatus } from "../status";
import { Match } from "../lib/database/types";
import NotificationHandler from "../lib/notifications/NotificationHandler";

const bodySchema = z.object({
	target: z.string().uuid(),
	interactions: z.array(z.enum([ 'flings', 'friends', 'romance' ])).max(3).optional(),
});

type Body = z.infer<typeof bodySchema>;

export async function post(req: RequestData): Promise<{ match: Match | null }> {
	const contact = await req.getContact();
	const body = await req.getBody<Body>(bodySchema);

	const db = req.env.cachedDatabase;
	await db.interactionsCreate(contact.id, body.target, body.interactions ?? []);

	const match = await db.matchGet(contact.id, body.target);
	if (match != null) await sendMatchNotification(body.target, new NotificationHandler(req.env));

	return { match };
}

export async function del(req: RequestData): Promise<{ matches: Match[] }> {
	const target = req.searchParams.get('target');
	if (target == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing target');

	const contact = await req.getContact();
	const db = req.env.cachedDatabase;
	await db.interactionsDelete(contact.id, target);
	await db.messagesDeleteBetween(contact.id, target);
	const res = await db.matchesGet(contact.id);

	return { matches: res };
}

async function sendMatchNotification(to: string, handler: NotificationHandler): Promise<void> {
	const shouldSendNotification = await handler.shouldSendNotificationsTo(to);
	if (!shouldSendNotification) return;
	await handler.sendNotificationTo(to, {
		notificationData: {
			title: 'Someone matched with you!',
			body: 'See who it is!',
		},
	});
}
