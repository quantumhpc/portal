// User model — PAM/system-auth edition.
// Passwords and per-user HPC/storage config are no longer stored in the DB.
// Authentication is handled by PAM; uid/gid/home come from the system at runtime.

export interface UserAdmin {
  isAdmin: boolean;
  active: boolean;
  sla?: boolean;
}

export interface UserProperties {
  version?: string;
}

/** Thin DB record — admin flags + optional display metadata only. */
export interface UserDocument {
  _id: string;
  username: string;          // system username; primary identity key
  displayName?: string;      // optional display name override
  email?: string;            // optional email for notifications
  admin: UserAdmin;
  properties?: UserProperties;
}

/** System-level identity resolved from getent/PAM at login. Stored in JWT. */
export interface SystemUser {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
}

/** Merged type used by HPC and file operations during a request. */
export interface AuthenticatedUser extends UserDocument {
  system: SystemUser;
}

export function getDefaultUser(username: string): Omit<UserDocument, "_id"> {
  return {
    username,
    admin: { isAdmin: false, active: true },
    properties: {},
  };
}

export function sanitizeUser(user: UserDocument): Omit<UserDocument, never> {
  return { ...user };
}
