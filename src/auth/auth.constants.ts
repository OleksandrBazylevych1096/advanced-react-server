export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60;
export const DEFAULT_MFA_TTL_SECONDS = 5 * 60;
export const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const REFRESH_COOKIE_NAME = 'refresh_token';

export const BCRYPT_ROUNDS = 12;
export const PASSWORD_POLICY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

