import { ZodSchema } from 'zod';
import * as neon from '@neondatabase/serverless';

type CacheOpts = {
	key: string,
	schema: ZodSchema,
	cacheTtl?: number,
	expiration?: number,
	expirationTtl?: number,
};

type Row = {
	[key: string]: any,
};

export enum DatabaseErrorKind {
	DuplicateKey = 'Duplicate Key',
	ForeignKeyViolation = 'Foreign Key Violation',
	Other = 'Other',
}

export class DatabaseError {
	readonly kind: DatabaseErrorKind;
	readonly message: string | null;

	constructor(kind: DatabaseErrorKind, message: string | null = null) {
		this.kind = kind;
		this.message = message;
	}

	toString(): string {
		if (this.message == null) return `Database error: ${this.kind}`;
		else return `Database error: ${this.kind}: ${this.message}`;
	}
}

// *many are not cacheable
export interface DatabaseInterface {
	close(ctx: ExecutionContext): void;
	readOne(query: string, params: any[], cacheOpts: CacheOpts | null): Promise<Row | null>;
	readMany(query: string, params: any[]): Promise<Row[]>;
	writeOne(query: string, params: any[], cacheOpts: CacheOpts | null): Promise<Row | null>;
	writeMany(query: string, params: any[]): Promise<Row[]>;
	deleteOne(query: string, params: any[], cacheOpts: CacheOpts | null): Promise<Row | null>;
	deleteMany(query: string, params: any[]): Promise<Row[]>;
}

export class CachedDatabaseInterface implements DatabaseInterface {
	private _cache: KVNamespace;
	private _inner: DatabaseInterface;

	constructor(cache: KVNamespace, inner: DatabaseInterface) {
		this._cache = cache;
		this._inner = inner;
	}

	close(ctx: ExecutionContext): void {
		this._inner.close(ctx);
	}

	async readOne(query: string, params: any[], cacheOpts: CacheOpts | null): Promise<Row | null> {
		if (cacheOpts == null) return await this._inner.readOne(query, params, null);

		let value = await this.getCachedValue(cacheOpts);
		if (value == null) {
			value = await this._inner.readOne(query, params, null);
			await this.putCachedValue(value, cacheOpts);
		}

		return value;
	}

	readMany(query: string, params: any[]): Promise<Row[]> {
		return this._inner.readMany(query, params);
	}

	async writeOne(query: string, params: any[], cacheOpts: CacheOpts | null): Promise<Row | null> {
		const value = await this._inner.writeOne(query, params, null);
		if (cacheOpts == null) return value;

		await this.putCachedValue(value, cacheOpts);
		return value;
	}

	writeMany(query: string, params: any[]): Promise<Row[]> {
		return this._inner.writeMany(query, params);
	}

	async deleteOne(query: string, params: any[], cacheOpts: CacheOpts | null): Promise<Row | null> {
		if (cacheOpts != null) await this._cache.delete(cacheOpts.key);
		return await this._inner.deleteOne(query, params, null);
	}

	deleteMany(query: string, params: any[]): Promise<Row[]> {
		return this._inner.deleteMany(query, params);
	}

	private async getCachedValue(opts: CacheOpts): Promise<any> {
		const value = await this._cache.get(opts.key, {
			cacheTtl: opts.cacheTtl,
			type: 'json',
		});

		if (value == null) return null;
		const parse = opts.schema.safeParse(value);
		if (!parse.success) throw new Error(`invalid schema provided to cache layer (get):\n${parse.error}`);
		return value;
	}

	private async putCachedValue(value: any, opts: CacheOpts): Promise<void> {
		if (value == null) return;

		const parse = opts.schema.safeParse(value);
		if (!parse.success) throw new Error(`invalid schema provided to cache layer (put):\n${parse.error}`);

		return await this._cache.put(opts.key, JSON.stringify(value), {
			expiration: opts.expiration,
			expirationTtl: opts.expirationTtl,
		});
	}
}

export class NeonDatabaseInterface implements DatabaseInterface {
	private _client: neon.Client;

	constructor(client: neon.Client) {
		this._client = client;
	}

	close(ctx: ExecutionContext): void {
		ctx.waitUntil(this._client.end());
	}

	async readOne(query: string, params: any[], _cacheOpts: CacheOpts | null): Promise<Row | null> {
		try {
			const res = await this._client.query(query, params);
			return this.returnOne(res.rows, 'readOne');
		} catch (e: any) {
			throw this.toDbError(e);
		}
	}

	async readMany(query: string, params: any[]): Promise<Row[]> {
		try {
			const res = await this._client.query(query, params);
			return res.rows;
		} catch (e: any) {
			throw this.toDbError(e);
		}
	}

	async writeOne(query: string, params: any[], _cacheOpts: CacheOpts | null): Promise<Row | null> {
		try {
			const res = await this._client.query(query, params);
			return this.returnOne(res.rows, 'writeOne');
		} catch (e: any) {
			throw this.toDbError(e);
		}
	}

	async writeMany(query: string, params: any[]): Promise<Row[]> {
		try {
			const res = await this._client.query(query, params);
			return res.rows;
		} catch (e: any) {
			throw this.toDbError(e);
		}
	}

	async deleteOne(query: string, params: any[], _cacheOpts: CacheOpts | null): Promise<Row | null> {
		try {
			const res = await this._client.query(query, params);
			return this.returnOne(res.rows, 'deleteOne');
		} catch (e: any) {
			throw this.toDbError(e);
		}
	}

	async deleteMany(query: string, params: any[]): Promise<Row[]> {
		try {
			const res = await this._client.query(query, params);
			return res.rows;
		} catch (e: any) {
			throw this.toDbError(e);
		}
	}

	private returnOne(rows: Row[], name: string): Row | null {
		if (rows.length == 0) return null;
		else if (rows.length > 1) throw new Error(`${name} returned too many rows`);
		else return rows[0];
	}

	private toDbError(error: any): DatabaseError {
		if (!(error instanceof neon.DatabaseError)) throw new DatabaseError(DatabaseErrorKind.Other, error?.toString());

		let kind: DatabaseErrorKind;
		switch (error.code) {
			case '23505':
				kind = DatabaseErrorKind.DuplicateKey;
				break;
			case '23503':
				kind = DatabaseErrorKind.ForeignKeyViolation;
				break;
			default:
				kind = DatabaseErrorKind.Other;
				break;
		}

		return new DatabaseError(kind, error.message);
	}

	static async connect(config: string): Promise<NeonDatabaseInterface> {
		const client = new neon.Client(config);
		await client.connect();
		return new NeonDatabaseInterface(client);
	}
}
