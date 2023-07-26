import { Env } from "../..";
import { getTokenFromGCPServiceAccount } from '@sagi.io/workers-jwt';
import { ServiceAccount } from "./types";

export async function getToken(env: Env, aud: string): Promise<string> {
	const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
	const token = await getTokenFromGCPServiceAccount({ serviceAccountJSON: serviceAccount, aud });
	return token;
}
