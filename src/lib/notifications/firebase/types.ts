export type StringMap = { [key: string]: string };

export type Message = {
	data?: StringMap,
	notification?: {
		title?: string,
		body?: string,
		image?: string,
	},
	android?: {
		collapse_key?: string,
		priority?: 'NORMAL' | 'HIGH',
		ttl?: string,
		restricted_package_name?: string,
		data?: StringMap,
		notification?: {
			title?: string,
			body?: string,
			icon?: string,
			color?: string,
			sound?: string,
			tag?: string,
			click_action?: string,
			body_loc_key?: string,
			body_loc_args?: string[],
			title_loc_key?: string,
			title_loc_args?: string[],
			channel_id?: string,
			ticker?: string,
			sticky?: boolean,
			event_time?: string,
			local_only?: boolean,
			notification_priority?: 'PRIORITY_MIN' | 'PRIORITY_LOW' | 'PRIORITY_DEFAULT' | 'PRIORITY_HIGH' | 'PRIORITY_MAX',
			default_sound?: boolean,
			default_vibrate_timings?: boolean,
			default_light_settings?: boolean,
			vibrate_timings?: string[],
			visibility?: 'PRIVATE' | 'PUBLIC' | 'SECRET',
			notification_count?: number,
			light_settings?: {
				color: { red: number, green: number, blue: number, alpha: number },
				light_on_duration: string,
				light_off_duration: string,
			},
			image?: string,
		},
		fcm_options?: { analytics_label?: string },
		direct_boot_ok?: boolean,
	},
	webpush?: {
		headers?: StringMap,
		data?: StringMap,
		notification?: object,
		fcm_options?: { link?: string, analytics_label?: string },
	},
	apns?: {
		headers?: StringMap,
		payload?: object,
		fcm_options?: { analytics_label?: string, image?: string },
	},
	fcm_options?: { analytics_label?: string },

	// UNION FIELDS - Exactly one field is required
	token?: string,     // Registration token
	topic?: string,     // Topic name
	condition?: string, // Condition
	// END UNION
};

export type ServiceAccount = {
	type: string,
	project_id: string,
	private_key_id: string,
	private_key: string,
	client_email: string,
	client_id: string,
	auth_uri: string,
	token_uri: string,
	auth_provider_x509_cert_url: string,
	universe_domain: string,
};

export type TokenPayload = {
	aud: string,
	iss: string,
	sub: string,
	iat: number,
	exp: number,
};
