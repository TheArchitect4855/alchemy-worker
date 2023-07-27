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
	pendingNotificationTypes: string[],
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
