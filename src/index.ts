import RequestError from './error';
import RequestData from './lib/RequestData';
import routes from './routes';
import { HandlerFn } from './lib/request_types';
import { HttpStatus } from './status';
import Database from './lib/Database';
import { getPayload as getJwtPayload } from './lib/jwt';
import { CachedDatabaseInterface, DatabaseInterface, NeonDatabaseInterface } from './lib/database/dbi';

const origin = 'https://web.usealchemy.app';
type HeaderDict = { [header: string]: string };

export interface Env {
	DATABASE_URL: string,
	DEBUG_PHONE: string,
	FIREBASE_SERVICE_ACCOUNT: string,
	KV_CACHE: KVNamespace,
	R2_LOGS: R2Bucket,
	R2_PHOTOS: R2Bucket,
	JWT_KEY_HEX: string,
	LOG_SECRET_HEX: string,
	TWILIO_ACCT_SID: string,
	TWILIO_AUTH: string,
	TWILIO_MESSAGING_PHN: string,
	TWILIO_VERIFY_SID: string,
	cachedDatabase: Database,
	rawDatabase: Database,
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);
		if (request.method == 'OPTIONS') return new Response(null, {
			headers: getCorsHeaders(request.method, request.headers),
		});

		let pathname = url.pathname;
		if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.substring(0, pathname.length - 1);

		const headers = getCorsHeaders(request.method, request.headers);
		let dbi: NeonDatabaseInterface | null = null;
		try {
			dbi = await NeonDatabaseInterface.connect(env.DATABASE_URL);
			env = { ...env }; // Clone env so we don't share DBIs across requests
			env.cachedDatabase = new Database(new CachedDatabaseInterface(env.KV_CACHE, dbi));
			env.rawDatabase = new Database(dbi);

			const handler = routes[pathname];
			if (handler == undefined) throw new RequestError(HttpStatus.NotFound);

			let fn: HandlerFn | undefined;
			switch (request.method) {
				case 'POST':
					fn = handler.post;
					break;
				case 'GET':
					fn = handler.get;
					break;
				case 'PUT':
					fn = handler.put;
					break;
				case 'DELETE':
					fn = handler.del;
					break;
				default:
					throw new RequestError(HttpStatus.MethodNotAllowed);
			}

			if (fn == undefined) throw new RequestError(HttpStatus.MethodNotAllowed, `${request.method} is not supported on this endpoint`);

			let res = fn(new RequestData(request, url, env, ctx));
			if (res instanceof Promise) res = await res;

			await createApiLog(env.rawDatabase, request, 200, null);
			return respondWith(res, headers);
		} catch (e: any) {
			if (e instanceof RequestError) {
				if (env.rawDatabase) await createApiLog(env.rawDatabase, request, e.status, e.message);
				return new Response(e.message, { headers, status: e.status });
			} else {
				const id = (Date.now() % 86_400_000).toString(16);
				const message = `Internal server error ${id}: ${e}`;
				console.log(message);
				console.error(e);
				if (env.rawDatabase) await createApiLog(env.rawDatabase, request, 500, message);
				return new Response(id, { headers, status: 500 });
			}
		} finally {
			if (dbi != null) ctx.waitUntil(dbi.close());
		}
	},
};

function createApiLog(db: Database, req: Request, status: number, errorMessage: string | null): Promise<void> {
	const authorization = req.headers.get('Authorization');
	const bearer = 'Bearer ';
	let contactId: string | null = null;
	if (authorization?.startsWith(bearer)) {
		const token = authorization.substring(bearer.length);
		const payload = getJwtPayload(token);
		if (payload != null) contactId = payload.sub;
	}

	const userAgent = req.headers.get('user-agent');
	const xClientInfo = req.headers.get('x-client-info');
	const clientInfo = xClientInfo ?? userAgent;
	return db.apiLogsCreate(
		req.method,
		req.url,
		status,
		new Date(), // Creating a date in a worker script always returns the start of the request
		clientInfo,
		errorMessage,
		req.headers.get('cf-connecting-ip'),
		contactId,
		userAgent
	);
}

function getCorsHeaders(method: string, headers: Headers): HeaderDict {
	let o: string;
	const requestOrigin = headers.get('origin');
	if (requestOrigin?.startsWith('http://localhost:')) o = requestOrigin;
	else o = origin;

	if (method == 'OPTIONS') return {
		'Access-Control-Allow-Credentials': 'true',
		'Access-Control-Allow-Headers': headers.get('access-control-request-headers') ?? '*',
		'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
		'Access-Control-Allow-Origin': o,
		'Access-Control-Max-Age': '86400',
	};

	return { 'Access-Control-Allow-Origin': o };
}

function respondWith(body: any, headers: HeaderDict): Response {
	if (body === undefined) return new Response(null, { headers });
	if (body instanceof Response) {
		return body;
	}

	return Response.json(body, {
		headers: {
			'Content-Type': 'application/json;charset=utf-8',
			...headers,
		},
	});
}
