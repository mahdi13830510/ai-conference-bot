/*
 * Remembers the last list a user was looking at, so the "Back"
 * button on a conference detail screen returns there instead of
 * dumping them at the main menu.
 */

ALTER TABLE users ADD COLUMN last_list TEXT;
