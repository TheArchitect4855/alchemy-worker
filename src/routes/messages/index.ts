import { z } from "zod";
import RequestError from "../../error";
import Database from "../../lib/Database";
import RequestData from "../../lib/RequestData";
import { Message, Preferences } from "../../lib/database/types";
import { HttpStatus } from "../../status";
import Messaging, { MessagingError } from "../../lib/firebase/Messaging";
import { Env } from "../..";

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
		
		const notificationConfig = await db.notificationConfigGet(contact.id);
		const split = notificationConfig?.pendingNotificationTypes.indexOf(matchMessageNotificationType);
		if (notificationConfig != null && split != undefined && split >= 0) {
			notificationConfig.pendingNotificationTypes.splice(split, 1);
			await db.notificationConfigUpdate(contact.id, notificationConfig.token, notificationConfig.pendingNotificationTypes);
		}
	}

	await db.messagesMarkRead(messages.map((e) => e.id));
	db.close(req.ctx);
	return { messages };
}

export async function post(req: RequestData): Promise<Message> {
	const contact = await req.getContact();
	const body = await req.getBody<Post>(postSchema);

	// DON'T use a cached interface here, because
	// 1. messages aren't cached anyways, and
	// 2. we want to make sure we have the target user's
	//    latest preferences re: notifications.
	const db = await Database.getInterface(req.env);
	const canMessage = await db.canMessageContact(contact.id, body.to);
	if (!canMessage) throw new RequestError(HttpStatus.Forbidden);

	const res = await db.messageCreate(contact.id, body.to, body.message);
	await sendNewMessageNotification(req.env, contact.id, body.to, res, db);
	db.close(req.ctx);
	return res;
}

async function sendNewMessageNotification(env: Env, sender: string, recipient: string, message: Message, db: Database): Promise<void> {
	const messaging = new Messaging(env);
	const cfg = await db.notificationConfigGet(recipient);
	if (cfg == null) return;

	const isMatchMessagePending = cfg.pendingNotificationTypes.indexOf(matchMessageNotificationType) >= 0;
	const prefs = await db.preferencesGet(recipient);
	const notification = (prefs.allowNotifications && !isMatchMessagePending) ? {
		title: 'You received a new message!',
		body: 'Don\'t keep them waiting!',
	} : undefined;

	try {
		await messaging.send({
			token: cfg.token,
			notification,
			data: {
				kind: matchMessageNotificationType,
				id: message.id.toString(),
				content: message.content,
				sentAt: message.sentAt.toISOString(),
				sender,
			},
		});
	} catch (e: any) {
		if (e instanceof MessagingError && e.status == 'INVALID_ARGUMENT') {
			// FCM token is invalid
			await db.notificationConfigDelete(recipient);
		} else throw e;
	}

	if (!isMatchMessagePending) {
		cfg.pendingNotificationTypes.push(matchMessageNotificationType);
		await db.notificationConfigUpdate(recipient, cfg.token, cfg.pendingNotificationTypes);
	}
}
