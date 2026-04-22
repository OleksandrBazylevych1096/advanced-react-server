type Env = Record<string, string | undefined>;

const requiredInProduction = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_MFA_SECRET',
  'JWT_FLOW_SECRET',
  'JWT_CHALLENGE_SECRET',
  'PASSWORD_RESET_SECRET',
  'DATA_ENCRYPTION_KEY_BASE64',
];

export function validateEnvironment(config: Env): Env {
  const nodeEnv = (config.NODE_ENV || 'development').toLowerCase();

  if (nodeEnv === 'production') {
    const missing = requiredInProduction.filter((key) => !config[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables in production: ${missing.join(', ')}`,
      );
    }
  }

  return config;
}
