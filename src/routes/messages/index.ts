import { z } from "zod";
import RequestError from "../../error";
import RequestData from "../../lib/RequestData";
import { Message, NotificationConfig } from "../../lib/database/types";
import { HttpStatus } from "../../status";
import NotificationHandler from "../../lib/notifications/NotificationHandler";

// TODO: Use durable objects + web sockets
// for real-time chat.

const matchMessageNotificationType = 'match-message';

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

	const db = req.env.cachedDatabase;
	let messages;
	if (olderThan) {
		const maxId = parseInt(olderThan);
		if (isNaN(maxId)) {
			throw new RequestError(HttpStatus.UnprocessableEntity, 'Invalid older than');
		}

		messages = await db.messagesGetOlder(contact.id, target, lim, maxId);
	} else {
		messages = await db.messagesGet(contact.id, target, lim);
	}

	await db.messagesMarkRead(messages.map((e) => e.id));
	return { messages };
}

export async function post(req: RequestData): Promise<Message> {
	const contact = await req.getContact();
	const body = await req.getBody<Post>(postSchema);

	// DON'T use a cached interface here, because
	// 1. messages aren't cached anyways, and
	// 2. we want to make sure we have the target user's
	//    latest preferences re: notifications.
	const db = req.env.rawDatabase;
	const canMessage = await db.canMessageContact(contact.id, body.to);
	if (!canMessage) throw new RequestError(HttpStatus.Forbidden);

	const res = await db.messageCreate(contact.id, body.to, body.message);
	await sendNewMessageNotification(contact.id, body.to, res, new NotificationHandler(req.env));
	return res;
}

async function sendNewMessageNotification(sender: string, recipient: string, message: Message, handler: NotificationHandler): Promise<void> {
	const canSendNotification = await handler.canSendNotificationsTo(recipient);
	if (!canSendNotification) return;

	const shouldSendNotification = await handler.shouldSendNotificationsTo(recipient);
	const notification = shouldSendNotification ? {
		title: 'You received a new message!',
		body: 'Don\'t keep them waiting!',
	} : undefined;

	await handler.sendNotificationTo(recipient, {
		notificationData: notification,
		messageData: {
			kind: matchMessageNotificationType,
			id: message.id.toString(),
			content: message.content,
			sentAt: message.sentAt.toISOString(),
			sender,
		}
	});
}
