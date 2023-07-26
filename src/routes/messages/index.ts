import { z } from "zod";
import RequestError from "../../error";
import Database from "../../lib/Database";
import RequestData from "../../lib/RequestData";
import { Message } from "../../lib/database/types";
import { HttpStatus } from "../../status";
import Messaging from "../../lib/firebase/Messaging";

// TODO: Use durable objects + web sockets
// for real-time chat.

const postSchema = z.object({
	to: z.string().uuid(),
	message: z.string().max(256, 'message must be < 256 characters'),
});

type Post = z.infer<typeof postSchema>;

export async function get(req: RequestData): Promise<{ messages: Message[] }> {
	const contact = await req.getContact();
	const target = req.searchParams.get('target');
	const limit = req.searchParams.get('limit');
	const olderThan = req.searchParams.get('olderThan');

	if (target == null) throw new RequestError(HttpStatus.UnprocessableEntity, 'Missing target');

	const lim = limit ? parseInt(limit) : 10;
	if (isNaN(lim)) throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid limit');

	const db = await Database.getCachedInterface(req.env);
	let messages;
	if (olderThan) {
		const maxId = parseInt(olderThan);
		if (isNaN(maxId)) {
			db.close(req.ctx);
			throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid older than');
		}

		messages = await db.messagesGetOlder(contact.id, target, lim, maxId);
	} else {
		messages = await db.messagesGet(contact.id, target, lim);
	}

	await db.messagesMarkRead(messages.map((e) => e.id));
	db.close(req.ctx);
	return { messages };
}

export async function post(req: RequestData): Promise<Message> {
	const contact = await req.getContact();
	const body = await req.getBody<Post>(postSchema);

	const db = await Database.getCachedInterface(req.env);
	const canMessage = await db.canMessageContact(contact.id, body.to);
	if (!canMessage) throw new RequestError(HttpStatus.Forbidden);

	const preferences = await db.preferencesGet(contact.id);
	if (preferences.allowNotifications) {
		const messaging = new Messaging(req.env);
		const fcmToken = await messaging.getCachedFcmToken(contact.id);
		if (fcmToken != null) {
			messaging.send({
				token: fcmToken,
				notification: {
					title: 'You received a new message',
					body: 'Don\'t keep them waiting!',
				},
			});
		}
	}

	const res = await db.messageCreate(contact.id, body.to, body.message);
	db.close(req.ctx);
	return res;
}
