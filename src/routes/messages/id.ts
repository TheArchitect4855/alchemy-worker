import { z } from "zod";
import RequestData from "../../lib/RequestData";
import Messaging from "../../lib/firebase/Messaging";

const putSchema = z.object({
	fcmToken: z.string(),
});

type Put = z.infer<typeof putSchema>;

export async function put(req: RequestData): Promise<void> {
	const body = await req.getBody<Put>(putSchema);
	const contact = await req.getContact();
	await Messaging.cacheFcmToken(req.env, contact.id, body.fcmToken);
}
