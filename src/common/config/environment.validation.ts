import {
  EnvironmentVariables,
  NodeEnvironment,
  nodeEnvironments,
} from './environment.variables';

const defaultDevelopmentOrigins = ['http://localhost:3000'];

function readOptionalString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function readRequiredString(
  config: Record<string, unknown>,
  key: string,
): string {
  const value = readOptionalString(config, key);

  if (value === undefined) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function readNodeEnvironment(
  config: Record<string, unknown>,
  key: string,
): NodeEnvironment {
  const value = readOptionalString(config, key);

  if (value === undefined) {
    return 'development';
  }

  if (nodeEnvironments.includes(value as NodeEnvironment)) {
    return value as NodeEnvironment;
  }

  throw new Error(
    `${key} must be one of: ${nodeEnvironments.join(', ')}. Received "${value}".`,
  );
}

function readPort(config: Record<string, unknown>, key: string): number {
  const value = readOptionalString(config, key);

  if (value === undefined) {
    return 3001;
  }

  const parsedValue = Number(value);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 1 ||
    parsedValue > 65535
  ) {
    throw new Error(`${key} must be an integer between 1 and 65535.`);
  }

  return parsedValue;
}

function readDatabaseUrl(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = readOptionalString(config, key);

  if (value === undefined) {
    return undefined;
  }

  try {
    new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL.`);
  }

  return value;
}

function readAllowedOrigins(
  config: Record<string, unknown>,
  key: string,
  nodeEnvironment: NodeEnvironment,
): string[] {
  const value = readOptionalString(config, key);

  if (value === undefined) {
    return nodeEnvironment === 'production' ? [] : defaultDevelopmentOrigins;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      let parsedOrigin: URL;

      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw new Error(
          `${key} must be a comma-separated list of origins (for example "http://localhost:3000"). Received "${origin}".`,
        );
      }

      if (parsedOrigin.origin !== origin.replace(/\/$/, '')) {
        throw new Error(
          `${key} entries must be bare origins without a path. Received "${origin}".`,
        );
      }

      return parsedOrigin.origin;
    });
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const nodeEnvironment = readNodeEnvironment(config, 'NODE_ENV');
  const databaseUrl = readDatabaseUrl(config, 'DATABASE_URL');
  const testDatabaseUrl = readDatabaseUrl(config, 'TEST_DATABASE_URL');

  const resolvedDatabaseUrl =
    nodeEnvironment === 'test' ? testDatabaseUrl : databaseUrl;

  if (resolvedDatabaseUrl === undefined) {
    throw new Error(
      nodeEnvironment === 'test'
        ? 'TEST_DATABASE_URL is required when NODE_ENV=test.'
        : 'DATABASE_URL is required.',
    );
  }

  return {
    NODE_ENV: nodeEnvironment,
    PORT: readPort(config, 'PORT'),
    DATABASE_URL: resolvedDatabaseUrl,
    CORS_ALLOWED_ORIGINS: readAllowedOrigins(
      config,
      'CORS_ALLOWED_ORIGINS',
      nodeEnvironment,
    ),
    RESEND_API_KEY: readRequiredString(config, 'RESEND_API_KEY'),
    EMAIL_FROM: readRequiredString(config, 'EMAIL_FROM'),
    FRONTEND_URL: readFrontendUrl(config, 'FRONTEND_URL', nodeEnvironment),
    OPENAI_API_KEY: readOptionalString(config, 'OPENAI_API_KEY'),
    AWS_REGION: readRequiredString(config, 'AWS_REGION'),
    AWS_S3_BUCKET: readRequiredString(config, 'AWS_S3_BUCKET'),
    AWS_ACCESS_KEY_ID: readRequiredString(config, 'AWS_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY: readRequiredString(config, 'AWS_SECRET_ACCESS_KEY'),
  };
}

function readFrontendUrl(
  config: Record<string, unknown>,
  key: string,
  nodeEnvironment: NodeEnvironment,
): string {
  const value = readOptionalString(config, key);

  if (value === undefined) {
    if (nodeEnvironment === 'production') {
      throw new Error(`${key} is required in production.`);
    }
    return 'http://localhost:3000';
  }

  try {
    new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL.`);
  }

  return value;
}
