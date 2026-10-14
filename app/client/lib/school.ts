/**
 * This system serves exactly one school. The name is permanent — never make
 * it a user-editable setting.
 *
 * Mirrored on the server at `app/server/src/common/school.ts`. The two
 * projects share no code, so this is deliberately duplicated rather than
 * imported — keep both strings identical if the name ever changes.
 */
export const SCHOOL_NAME = "West Prime Horizon Institute Inc.";

/**
 * The short name and the address the sidebar shows under it. Client-only (the
 * server never prints them), so there is no second copy to keep in step.
 */
export const SCHOOL_SHORT_NAME = "WPH Institute";
export const SCHOOL_ADDRESS = "Barangay San Francisco";
