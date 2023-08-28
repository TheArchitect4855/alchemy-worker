CREATE TABLE api_logs (
	method VARCHAR(16) NOT NULL,
	url TEXT NOT NULL,
	status INT NOT NULL CHECK (status >= 100 AND status < 600),
	request_duration INTERVAL NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	client_info TEXT,
	error_message TEXT CHECK (error_message IS NULL OR status != 200),
	client_ip VARCHAR(39),
	contact_id UUID,
	user_agent TEXT
);

CREATE TABLE client_versions (
	semver TEXT NOT NULL,
	is_update_required BOOLEAN NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (created_at, semver)
);

-- To extend this to support more contact methods (e.g. email),
-- make both phone and email nullable and then add a check constraint.
CREATE TABLE contacts (
	id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
	phone TEXT NOT NULL UNIQUE,
	dob DATE NOT NULL,
	is_redlisted BOOLEAN NOT NULL DEFAULT FALSE,
	tos_agreed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE likes (
	contact UUID NOT NULL REFERENCES contacts (id),
	likes UUID NOT NULL REFERENCES contacts (id),
	liked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (contact, likes)
);

CREATE TABLE messages (
	id SERIAL NOT NULL UNIQUE,
	from_contact UUID NOT NULL REFERENCES contacts (id),
	to_contact UUID NOT NULL REFERENCES contacts (id),
	content VARCHAR(256) NOT NULL,
	sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	read_at TIMESTAMPTZ,
	PRIMARY KEY (to_contact, from_contact, id)
);

CREATE TABLE notification_config (
	contact UUID NOT NULL PRIMARY KEY REFERENCES contacts (id),
	token TEXT NOT NULL,
	token_last_updated TIMESTAMPTZ NOT NULL,
	pending_notification_types TEXT[] NOT NULL
);

CREATE TABLE preferences (
	contact UUID NOT NULL PRIMARY KEY REFERENCES contacts (id),
	allow_notifications BOOLEAN NOT NULL DEFAULT TRUE,
	show_transgender BOOLEAN NOT NULL,
	gender_interests TEXT[] NOT NULL CHECK (gender_interests <@ ARRAY['men', 'nonbinary', 'women']),
);

CREATE TABLE profiles (
	contact UUID NOT NULL PRIMARY KEY REFERENCES contacts (id),
	name VARCHAR(128) NOT NULL,
	bio VARCHAR(1024) NOT NULL,
	gender VARCHAR(16) NOT NULL,
	is_transgender BOOLEAN NOT NULL,
	relationship_interests TEXT[] NOT NULL CHECK (relationship_interests <@ ARRAY['flings', 'friends', 'romance']),
	is_visible BOOLEAN NOT NULL DEFAULT FALSE,
	last_location GEOMETRY (Point, 4326) NOT NULL,
	last_location_name VARCHAR(32) NOT NULL,
	photo_urls TEXT[] NOT NULL DEFAULT '{}',
	neurodiversities VARCHAR(32)[],
	interests VARCHAR(32)[],
	pronouns VARCHAR(32)
);

CREATE TABLE reports (
	contact UUID NOT NULL REFERENCES contacts (id),
	reporter UUID NOT NULL REFERENCES contacts (id),
	reason TEXT NOT NULL,
	UNIQUE (contact, reporter)
);

CREATE TABLE requests (
	target TEXT NOT NULL,
	kind TEXT NOT NULL REFERENCES request_kinds (kind),
	created TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (target, kind)
);

CREATE TABLE request_kinds (kind TEXT NOT NULL PRIMARY KEY);

CREATE TABLE review_queue (
	id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
	kind TEXT NOT NULL CHECK (kind IN ('profile')),
	item UUID NOT NULL UNIQUE
);

CREATE TABLE user_logs (
	target TEXT NOT NULL,
	key TEXT NOT NULL,
	contact UUID REFERENCES contacts (id),
	created TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (target, key)
);

CREATE TABLE waiting_list (
	phone TEXT NOT NULL PRIMARY KEY,
	iso_country CHAR(2) NOT NULL,
	administrative_area VARCHAR(128) NOT NULL,
	locality VARCHAR(128) NOT NULL
);
