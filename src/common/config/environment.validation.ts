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

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  return {
    NODE_ENV: readNodeEnvironment(config, 'NODE_ENV'),
    PORT: readPort(config, 'PORT'),
  };
}
