import {
  EnvironmentVariables,
  NodeEnvironment,
  nodeEnvironments,
} from './environment.variables';

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

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const nodeEnvironment = readNodeEnvironment(config, 'NODE_ENV');
  const port = readPort(config, 'PORT');
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
    PORT: port,
    DATABASE_URL: resolvedDatabaseUrl,
  };
}
