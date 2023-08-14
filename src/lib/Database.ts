import { Env } from "..";
import { Match, Profile, Message, Preferences, Contact, Request, NotificationConfig } from "./database/types";
import { Duration } from "./time";
import Location from "./Location";
import { CachedDatabaseInterface, DatabaseInterface, NeonDatabaseInterface } from "./database/dbi";
import { canMessageContactSchema, contactSchema, explorePreferencesSchema, preferencesSchema, profileSchema } from "./database/cache_schemas";

const likesMaxAge = '24 HOURS';

export default class Database {
	private _interface: DatabaseInterface;

	constructor(dbi: DatabaseInterface) {
		this._interface = dbi;
	}

	close(ctx: ExecutionContext): void {
		this._interface.close(ctx);
	}

	async canMessageContact(from: string, to: string): Promise<boolean> {
		const ord = [from, to];
		ord.sort();

		const row = await this._interface.readOne(`
			SELECT COUNT(*) AS n
			FROM likes l1
			INNER JOIN likes l2
				ON l1.contact = l2.likes
				AND l1.likes = l2.contact
			WHERE l1.contact = $1
				AND l1.likes = $2
		`, [from, to], {
			key: `canMessage.${ord.join('.')}`,
			schema: canMessageContactSchema,
			expirationTtl: 300,
		});

		return (parseInt(row?.n) ?? 0) > 0;
	}

	async contactCreate(phone: string, dob: Date, isRedlisted: boolean): Promise<string> {
		const query = await this._interface.writeOne(`
			INSERT INTO contacts (phone, dob, is_redlisted)
			VALUES ($1, $2, $3)
			RETURNING id, phone, dob, is_redlisted, tos_agreed
		`, [phone, dob, isRedlisted], null);

		return query!.id;
	}

	async contactGet(id: string): Promise<Contact | null> {
		const row = await this._interface.readOne(`
			SELECT id, phone, dob, is_redlisted, tos_agreed
			FROM contacts
			WHERE id = $1
		`, [id], {
			key: `contact.${id}`,
			schema: contactSchema,
			expirationTtl: 500,
		});

		if (row == null) return null;

		return {
			id,
			phone: row.phone,
			dob: new Date(row.dob),
			isRedlisted: row.is_redlisted,
			tosAgreed: row.tos_agreed,
		};
	}

	async contactGetByPhone(phone: string): Promise<Contact | null> {
		const row = await this._interface.readOne(`
			SELECT id, dob, is_redlisted, tos_agreed
			FROM contacts
			WHERE phone = $1
		`, [phone], null);

		if (row == null) return null;

		return {
			id: row.id,
			phone,
			dob: new Date(row.dob),
			isRedlisted: row.is_redlisted,
			tosAgreed: row.tos_agreed,
		};
	}

	async contactSetAgreeTos(id: string, agreeTos: boolean): Promise<void> {
		await this._interface.writeOne(
			`
			UPDATE contacts
			SET tos_agreed = $2
			WHERE id = $1
			RETURNING id, phone, dob, is_redlisted, tos_agreed
		`,
			[id, agreeTos],
			{
				key: `contact.${id}`,
				schema: contactSchema,
				expirationTtl: 500,
			}
		);
	}

	async exploreGetProfiles(
		contact: string,
		location: Location,
		locationName: string,
		maxDistanceMetres: number
	): Promise<Profile[]> {
		const preferences = await this._interface.readOne(`
			SELECT co.dob, pr.show_transgender, pr.gender_interests
			FROM contacts co
			LEFT JOIN preferences pr
				ON pr.contact = co.id
			WHERE co.id = $1
		`, [contact], null);

		if (preferences == null) throw new Error('invalid contact ID');
		const genderInterests = preferences.gender_interests?.map((e: string) => `'${e}'`).join(',') ?? '\'men\',\'nonbinary\',\'women\'';

		const likes = (await this._interface.readMany(`
			SELECT likes
			FROM likes
			WHERE contact = $1
				AND liked_at > now() - INTERVAL '${likesMaxAge}'
		`, [contact])).map((e) => e.likes);

		const matches = await this.getMatchContactIds(contact);
		const exclude = [contact, ...likes, ...matches].map((e) => `'${e}'`);

		// Update location before getting potential matches
		await this._interface.writeOne(`
			UPDATE profiles
			SET last_location = ST_Point($3, $2, 4326),
				last_location_name = $1
			WHERE contact = $4
		`, [locationName, location.latitude, location.longitude, contact], null);

		// TODO: Actually profile and/or A/B test this to see
		// if it's faster to query contact IDs and then profiles,
		// or to just query all the profiles at once.
		const contacts = await this._interface.readMany(`
			SELECT co.id
			FROM profiles pr
			INNER JOIN contacts co
				ON co.id = pr.contact
			WHERE pr.contact NOT IN (${exclude.join(',')})
				AND (
					(pr.gender = 'man' AND 'men' IN (${genderInterests}))
					OR (pr.gender = 'woman' AND 'women' IN (${genderInterests}))
					OR (pr.gender != 'man' AND pr.gender != 'woman' AND 'nonbinary' IN (${genderInterests}))
				) AND (NOT pr.is_transgender OR $1)
				AND pr.is_visible = true
				AND ST_DWithin(pr.last_location, ST_Point($3, $2, 4326), $4)
			ORDER BY abs(co.dob - $5) ASC,
				ST_Distance(pr.last_location, ST_Point($3, $2, 4326)) ASC
		`, [
			preferences.show_transgender ?? true,
			location.latitude, location.longitude, maxDistanceMetres,
			preferences.dob,
		]);

		const profiles = await Promise.all(contacts.map((e) => this.profileGet(e.id) as Promise<Profile>));
		return profiles;
	}

	async like(contact: string, likes: string): Promise<void> {
		await this._interface.writeOne(`
			INSERT INTO likes (contact, likes)
			VALUES ($1, $2)
			ON CONFLICT (contact, likes) DO UPDATE
			SET liked_at = now()
		`, [contact, likes], null);
	}

	async likesGet(contact: string): Promise<Profile[]> {
		const contacts = await this._interface.readMany(`
			SELECT likes
			FROM likes
			WHERE contact = $1
				AND liked_at > now() + INTERVAL '${likesMaxAge}'
		`, [contact]);

		const profiles = await Promise.all(contacts.map((e) => this.profileGet(e.contact) as Promise<Profile>));
		return profiles;
	}

	async likesDelete(contact: string, likes: string): Promise<void> {
		await this._interface.deleteOne(`
			DELETE FROM likes
			WHERE contact = $1
				AND likes = $2
		`, [contact, likes], null);
	}

	async matchGet(contact: string, likes: string): Promise<Match | null> {
		const row = await this._interface.readOne(`
			SELECT COUNT(*) = 2 AS is_match
			FROM likes
			WHERE (contact = $1 AND likes = $2)
				OR (contact = $2 AND likes = $1)
		`, [contact, likes], null);

		if (row?.is_match !== true) return null;

		const profile = (await this.profileGet(likes))!;
		const lastMessageRow = await this._interface.readOne(`
			SELECT id, from_contact, to_contact, sent_at
			FROM messages
			WHERE (from_contact = $1 AND to_contact = $2)
				OR (from_contact = $2 AND to_contact = $1)
			ORDER BY id DESC
			LIMIT 1
		`, [contact, likes], null);

		let lastMessage: Message | null = null;
		if (lastMessageRow != null) {
			lastMessage = {
				id: lastMessageRow.id,
				from: lastMessageRow.from_contact == contact ? 0 : 1,
				content: lastMessageRow.content,
				sentAt: lastMessageRow.sent_at,
			};
		}

		const numUnread = await this._interface.readOne(`
			SELECT COUNT(*) AS n
			FROM messages
			WHERE from_contact = $2 AND to_contact = $1
				AND read_at IS NULL
		`, [contact, likes], null);

		return {
			profile,
			lastMessage: lastMessage,
			numUnread: parseInt(numUnread?.n) ?? 0,
		};
	}

	async matchesGet(contact: string): Promise<Match[]> {
		const contacts = await this.getMatchContactIds(contact);
		const profiles = await Promise.all(contacts.map((e) => this.profileGet(e)));
		const lastMessages = await Promise.all(contacts.map((e) => this._interface.readOne(`
			SELECT id, from_contact, to_contact, content, sent_at
			FROM messages
			WHERE (from_contact = $1 AND to_contact = $2)
				OR (from_contact = $2 AND to_contact = $1)
			ORDER BY id DESC
			LIMIT 1
		`, [contact, e], null)));

		const numUnread = await Promise.all(contacts.map((e) => this._interface.readOne(`
			SELECT COUNT(*) AS n
			FROM messages
			WHERE from_contact = $2 AND to_contact = $1
				AND read_at IS NULL
		`, [contact, e], null)));

		const matches = [];
		for (let i = 0; i < profiles.length; i += 1) {
			if (profiles[i] == null) continue;

			let lastMessage: Message | null = null;
			if (lastMessages[i] != null) {
				const lm = lastMessages[i]!;
				lastMessage = {
					id: lm.id,
					from: lm.from_contact == contact ? 0 : 1,
					content: lm.content,
					sentAt: lm.sent_at,
				}
			}

			matches.push({
				profile: profiles[i]!,
				lastMessage,
				numUnread: parseInt(numUnread[i]?.n) ?? 0,
			});
		}

		return matches;
	}

	async messageCreate(from: string, to: string, content: string): Promise<Message> {
		const row = (await this._interface.writeOne(`
			INSERT INTO messages (from_contact, to_contact, content)
			VALUES ($1, $2, $3)
			RETURNING id, sent_at
		`, [from, to, content], null))!;

		return {
			id: row.id,
			from: 0,
			content,
			sentAt: row.sent_at,
		};
	}

	async messagesGet(localContact: string, remoteContact: string, limit: number): Promise<Message[]> {
		const query = await this._interface.readMany(`
			SELECT id, from_contact, to_contact, content, sent_at
			FROM messages
			WHERE (from_contact = $1 AND to_contact = $2)
				OR (from_contact = $2 AND to_contact = $1)
			ORDER BY id DESC
			LIMIT $3
		`, [localContact, remoteContact, limit]);

		return query.map((e) => ({
			id: e.id,
			from: e.from_contact == localContact ? 0 : 1,
			content: e.content,
			sentAt: e.sent_at,
		}));
	}

	async messagesGetOlder(localContact: string, remoteContact: string, limit: number, maxId: number): Promise<Message[]> {
		const query = await this._interface.readMany(`
			SELECT id, from_contact, to_contact, content, sent_at
			FROM messages
			WHERE ((from_contact = $1 AND to_contact = $2)
				OR (from_contact = $2 AND to_contact = $1))
				AND id < $4
			ORDER BY id DESC
			LIMIT $3
		`, [localContact, remoteContact, limit, maxId]);

		return query.map((e) => ({
			id: e.id,
			from: e.from_contact == localContact ? 0 : 1,
			content: e.content,
			sentAt: e.sent_at,
		}));
	}

	async messagesMarkRead(messageIds: number[]): Promise<void> {
		if (messageIds.length == 0) return;

		messageIds.forEach((e) => {
			if (typeof e != 'number') throw new Error('message IDs contained non-numerical data');
		});

		const ids = messageIds.join(',');
		await this._interface.writeMany(`
			UPDATE messages
			SET read_at = now()
			WHERE id IN (${ids})
		`, []);
	}

	async messagesDeleteBetween(a: string, b: string): Promise<void> {
		await this._interface.deleteMany(`
			DELETE FROM messages
			WHERE (from_contact = $1 AND to_contact = $2)
				OR (from_contact = $2 AND to_contact = $1)
		`, [a, b]);
	}

	async notificationConfigGet(contact: string): Promise<NotificationConfig | null> {
		const row = await this._interface.readOne(`
			SELECT token, token_last_updated, pending_notification_types
			FROM notification_config
			WHERE contact = $1
		`, [contact], null);

		if (row == null) return null;
		return {
			contact,
			token: row.token,
			tokenLastUpdated: row.token_last_updated,
			pendingNotificationTypes: row.pending_notification_types,
		};
	}

	async notificationConfigUpdate(contact: string, token: string, pendingNotificationTypes: string[]): Promise<void> {
		await this._interface.writeOne(`
			INSERT INTO notification_config (
				contact, token, token_last_updated, pending_notification_types
			) VALUES ($1, $2, now(), $3)
			ON CONFLICT (contact) DO UPDATE
			SET token = $2,
				token_last_updated = CASE notification_config.token
					WHEN $2 THEN now()
					ELSE notification_config.token_last_updated
				END,
				pending_notification_types = $3
		`, [contact, token, pendingNotificationTypes], null);
	}

	async notificationConfigDelete(contact: string): Promise<void> {
		await this._interface.deleteOne(`
			DELETE FROM notification_config
			WHERE contact = $1
		`, [contact], null);
	}

	async photoAdd(contact: string, url: string, dob: Date): Promise<void> {
		await this._interface.writeOne(`
			UPDATE profiles
			SET photo_urls = photo_urls || $1,
				is_visible = false
			WHERE contact = $2
			RETURNING contact, name, $3 AS dob, bio,
				gender, photo_urls, relationship_interests,
				neurodiversities, interests, last_location_name,
				pronouns
		`, [[url], contact, dob], {
			key: `profile.${contact}`,
			schema: profileSchema,
			expirationTtl: 3600,
		});

		await this._interface.writeOne(`
			INSERT INTO review_queue (kind, item)
			VALUES ('profile', $1)
			ON CONFLICT (item) DO NOTHING
		`, [contact], null);
	}

	async photoRemove(contact: string, url: string, dob: Date): Promise<void> {
		await this._interface.writeOne(`
			UPDATE profiles
			SET photo_urls = array_remove(photo_urls, $1)
			WHERE contact = $2
			RETURNING contact, name, $3 AS dob, bio,
				gender, photo_urls, relationship_interests,
				neurodiversities, interests, last_location_name,
				pronouns
		`, [url, contact, dob], {
			key: `profile.${contact}`,
			schema: profileSchema,
			expirationTtl: 3600,
		});
	}

	async preferencesGet(contact: string): Promise<Preferences> {
		const cacheOpts = {
			key: `preferences.${contact}`,
			schema: preferencesSchema,
			expirationTtl: 300,
		};

		let row = await this._interface.readOne(`
			SELECT contact, allow_notifications, show_transgender, gender_interests
			FROM preferences
			WHERE contact = $1
		`, [contact], cacheOpts);

		if (row == null) {
			row = (await this._interface.writeOne(`
				INSERT INTO preferences (
					contact, allow_notifications, show_transgender,
					gender_interests
				) VALUES ($1, true, true, '{ "men", "nonbinary", "women" }')
				RETURNING contact, allow_notifications, show_transgender, gender_interests
			`, [contact], cacheOpts))!;
		}

		return {
			allowNotifications: row.allow_notifications,
			showTransgender: row.show_transgender,
			genderInterests: row.gender_interests,
		};
	}

	async preferencesSet(contact: string, preferences: Preferences): Promise<void> {
		await this._interface.writeOne(`
			INSERT INTO preferences (contact, allow_notifications, show_transgender, gender_interests)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (contact) DO UPDATE
			SET allow_notifications = $2,
				show_transgender = $3,
				gender_interests = $4
			RETURNING contact, allow_notifications, show_transgender, gender_interests
		`, [
			contact,
			preferences.allowNotifications,
			preferences.showTransgender,
			preferences.genderInterests
		], {
			key: `preferences.${contact}`,
			schema: preferencesSchema,
			expirationTtl: 300,
		});
	}

	async profileCreate(
		contact: string,
		name: string,
		dob: Date,
		bio: string,
		gender: string,
		isTransgender: boolean,
		photoUrls: string[],
		relationshipInterests: string[],
		neurodiversities: string[],
		interests: string[],
		pronouns: string | null,
		location: Location,
		city: string,
	): Promise<Profile> {
		const row = (await this._interface.writeOne(`
			INSERT INTO profiles (
				contact, name, bio, gender, is_transgender, relationship_interests,
				last_location_name, neurodiversities,
				interests, pronouns, last_location, photo_urls
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ST_Point($12, $11, 4326), $14)
			RETURNING contact, name, $13 AS dob, bio,
				gender, photo_urls, relationship_interests,
				neurodiversities, interests, last_location_name,
				pronouns
		`, [
			contact,
			name,
			bio,
			gender,
			isTransgender,
			relationshipInterests,
			city,
			neurodiversities,
			interests,
			pronouns,
			location.latitude,
			location.longitude,
			dob,
			photoUrls,
		], {
			key: `profile.${contact}`,
			schema: profileSchema,
			expirationTtl: 3600,
		}))!;

		// Ignore conflicts here; there can be duplicates
		// if the contact was in the review queue, then deleted
		// their profile, and then creates a new one.
		await this._interface.writeOne(`
			INSERT INTO review_queue (kind, item)
			VALUES ('profile', $1)
			ON CONFLICT DO NOTHING
		`, [row.contact], null);

		const age = Math.floor(Duration.between(new Date(), new Date(row.dob)).asYears());
		return {
			uid: row.contact,
			name: row.name,
			age,
			bio: row.bio,
			gender: row.gender,
			photoUrls: row.photo_urls,
			relationshipInterests: row.relationship_interests,
			neurodiversities: row.neurodiversities,
			interests: row.interests,
			city: row.last_location_name,
			pronouns: row.pronouns,
		};
	}

	async profileGet(contact: string): Promise<Profile | null> {
		const row = await this._interface.readOne(`
			SELECT co.id AS contact, pr.name, co.dob, pr.bio,
				pr.gender, pr.photo_urls, pr.relationship_interests,
				pr.neurodiversities, pr.interests, pr.last_location_name,
				pr.pronouns
			FROM contacts co
			INNER JOIN profiles pr
				ON co.id = pr.contact
			WHERE co.id = $1
		`, [contact], {
			key: `profile.${contact}`,
			schema: profileSchema,
			expirationTtl: 3600,
		});

		if (row == null) return null;

		const age = Math.floor(Duration.between(new Date(), new Date(row.dob)).asYears());
		return {
			uid: row.contact,
			name: row.name?.trim(),
			age,
			bio: row.bio?.trim(),
			gender: row.gender?.trim(),
			photoUrls: row.photo_urls,
			relationshipInterests: row.relationship_interests,
			neurodiversities: row.neurodiversities.map((e: string) => e.trim()),
			interests: row.interests,
			city: row.last_location_name?.trim(),
			pronouns: row.pronouns?.trim(),
		};
	}

	async profileUpdate(
		contact: string,
		name: string,
		dob: Date,
		bio: string,
		gender: string,
		relationshipInterests: string[],
		neurodiversities: string[],
		interests: string[],
		pronouns: string | null
	): Promise<Profile> {
		const row = await this._interface.writeOne(`
			UPDATE profiles
			SET name = $2,
				bio = $3,
				gender = $4,
				relationship_interests = $5,
				is_visible = false,
				neurodiversities = $6,
				interests = $7,
				pronouns = $8
			WHERE contact = $1
			RETURNING contact, name, $9 AS dob, bio,
				gender, photo_urls, relationship_interests,
				neurodiversities, interests, last_location_name,
				pronouns
		`, [
			contact,
			name,
			bio,
			gender,
			relationshipInterests,
			neurodiversities,
			interests,
			pronouns,
			dob,
		], {
			key: `profile.${contact}`,
			schema: profileSchema,
			expirationTtl: 3600,
		});

		if (row == null) throw new Error('invalid contact');

		await this._interface.writeOne(`
			INSERT INTO review_queue (kind, item)
			VALUES ('profile', $1)
			ON CONFLICT DO NOTHING
		`, [row.contact], null);

		const age = Math.floor(Duration.between(new Date(), new Date(row.dob)).asYears());
		return {
			uid: row.contact,
			name: row.name,
			age,
			bio: row.bio,
			gender: row.gender,
			photoUrls: row.photo_urls,
			relationshipInterests: row.relationship_interests,
			neurodiversities: row.neurodiversities,
			interests: row.interests,
			city: row.last_location_name,
			pronouns: row.pronouns,
		};
	}

	async profileDelete(contact: string): Promise<void> {
		await this._interface.deleteMany(`
			DELETE FROM likes
			WHERE contact = $1
				OR likes = $1
		`, [contact]);

		await this._interface.deleteMany(`
			DELETE FROM messages
			WHERE from_contact = $1
				OR to_contact = $1
		`, [contact]);

		await this._interface.deleteMany(`
			DELETE FROM review_queue
			WHERE kind = 'profile'
				AND item = $1
		`, [contact]);

		await this._interface.deleteOne(`
			DELETE FROM review_queue
			WHERE kind = 'profile'
				AND item = $1
		`, [contact], null);

		await this._interface.deleteOne(`
			DELETE FROM profiles
			WHERE contact = $1
		`, [contact], {
			key: `profile.${contact}`,
			schema: profileSchema,
		});
	}

	async reportCreate(contact: string, reason: string, reporter: string): Promise<void> {
		await this._interface.writeOne(`
			INSERT INTO reports (contact, reason, reporter)
			VALUES ($1, $2, $3)
		`, [contact, reason, reporter], null);
	}

	async requestCreate(target: string, kind: 'logs'): Promise<void> {
		await this._interface.writeOne(`
			INSERT INTO requests (target, kind)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, [target, kind], null);
	}

	async requestGet(target: string, kind: 'logs'): Promise<Request | null> {
		const row = await this._interface.readOne(`
			SELECT target, kind, created
			FROM requests
			WHERE target = $1
				AND kind = $2
		`, [target, kind], null);

		if (row == null) return null;
		return {
			target: row.target,
			kind: row.kind,
			created: row.created,
		};
	}

	async requestDelete(target: string, kind: 'logs'): Promise<void> {
		await this._interface.deleteOne(`
			DELETE FROM requests
			WHERE target = $1
				AND kind = $2
		`, [target, kind], null);
	}

	async userLogCreate(target: string, key: string, contact: string | null): Promise<void> {
		await this._interface.writeOne(`
			INSERT INTO user_logs (target, key, contact)
			VALUES ($1, $2, $3)
		`, [target, key, contact], null);
	}

	async waitingListAdd(phone: string, isoCountry: string, adminArea: string, locality: string): Promise<void> {
		await this._interface.writeOne(`
			INSERT INTO waiting_list (phone, iso_country, administrative_area, locality)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (phone) DO UPDATE
			SET iso_country = $2,
				administrative_area = $3,
				locality = $4
		`, [phone, isoCountry, adminArea, locality], null);
	}

	private async getMatchContactIds(contact: string): Promise<string[]> {
		const contacts = await this._interface.readMany(`
			SELECT l2.contact
			FROM likes l1
			INNER JOIN likes l2
				ON l2.contact = l1.likes
				AND l2.likes = l1.contact
			WHERE l1.contact = $1
		`, [contact]);

		return contacts.map((e) => e.contact);
	}

	static async getInterface(env: Env): Promise<Database> {
		const dbi = await NeonDatabaseInterface.connect(env.DATABASE_URL);
		return new Database(dbi);
	}

	static async getCachedInterface(env: Env): Promise<Database> {
		const dbi = await NeonDatabaseInterface.connect(env.DATABASE_URL);
		return new Database(new CachedDatabaseInterface(env.KV_CACHE, dbi));
	}
}
