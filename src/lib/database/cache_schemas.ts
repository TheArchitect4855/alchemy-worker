import { z } from "zod";

const dateRegex = /^[0-9]{4}-[0-9]{2}-[0-9]{2}(T\d{2}:\d{2}:\d{2}.\d{3}(Z|\+\d{2}:\d{2}))?$/;

export const canMessageContactSchema = z.object({
	n: z.string().regex(/^\d+$/).nullable(),
});

export const contactSchema = z.object({
	id: z.string().uuid(),
	phone: z.string(),
	dob: z.date().or(z.string().regex(dateRegex)),
	is_redlisted: z.boolean(),
	tos_agreed: z.boolean(),
});

export const explorePreferencesSchema = z.object({
	dob: z.date().or(z.string().regex(dateRegex)),
	show_transgender: z.boolean().nullable(),
	gender_interests: z.array(z.string()).nullable(),
});

export const preferencesSchema = z.object({
	contact: z.string().uuid(),
	allow_notifications: z.boolean(),
	show_transgender: z.boolean(),
	gender_interests: z.array(z.string()),
});

export const profileSchema = z.object({
	contact: z.string().uuid(),
	name: z.string(),
	dob: z.date().or(z.string().regex(dateRegex)),
	bio: z.string(),
	gender: z.string(),
	photo_urls: z.array(z.string()),
	relationship_interests: z.array(z.string()),
	neurodiversities: z.array(z.string()),
	interests: z.array(z.string()),
	last_location_name: z.string(),
	pronouns: z.string().nullable(),
});


