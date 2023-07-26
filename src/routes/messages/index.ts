import { z } from "zod";
import RequestError from "../../error";
import Database from "../../lib/Database";
import RequestData from "../../lib/RequestData";
import { Message } from "../../lib/database/types";
import { HttpStatus } from "../../status";
import Messaging, { MessagingError } from "../../lib/firebase/Messaging";
import { Env } from "../..";

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

	const res = await db.messageCreate(contact.id, body.to, body.message);
	const preferences = await db.preferencesGet(body.to);
	if (preferences.allowNotifications) await sendNewMessageNotification(req.env, body.to);

	db.close(req.ctx);
	return res;
}

async function sendNewMessageNotification(env: Env, contactId: string): Promise<void> {
	const messaging = new Messaging(env);
	const fcmToken = await messaging.getCachedFcmToken(contactId);
	if (fcmToken == null) return;
	try {
		await messaging.send({
			token: fcmToken,
			notification: {
				title: 'You received a new message',
				body: 'Don\'t keep them waiting!',
			},
		});

		console.log(`Sent new message notification to ${contactId} (${fcmToken})`);
	} catch (e: any) {
		if (e instanceof MessagingError && e.status == 'INVALID_ARGUMENT') {
			// FCM token is invalid
			messaging.deleteCachedFcmToken(contactId);
		} else throw e;
	}
}
