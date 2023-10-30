export type ClientVersion = {
	semver: string,
	isUpdateRequired: boolean,
	createdAt: Date,
};

export type Contact = {
	id: string,
	phone: string,
	dob: Date,
	isRedlisted: boolean,
	tosAgreed: boolean,
};

export type Match = {
	profile: Profile,
	lastMessage: Message | null,
	numUnread: number,
	interactions: string[],
};

export type Message = {
	id: number,
	from: 0 | 1, // 0 = local user, 1 = remote user
	content: string,
	sentAt: Date,
};

export type NotificationConfig = {
	contact: string,
	token: string,
	tokenLastUpdated: Date,
	lastNotificationAt: Date | null,
};

export type PhoneGreenlist = {
	phone: string,
	nickname: string,
};

export type Preferences = {
	allowNotifications: boolean,
	showTransgender: boolean,
	genderInterests: string[],
};

export type Profile = {
	uid: string,
	name: string,
	age: number,
	bio: string,
	gender: string,
	photoUrls: string[],
	relationshipInterests: string[],
	neurodiversities: string[],
	interests: string[],
	city: string,
	pronouns: string | null,
};

export type Request = {
	target: string,
	kind: 'logs',
	created: Date,
};
