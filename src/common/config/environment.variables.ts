export const nodeEnvironments = [
  'test',
  'development',
  'qa',
  'production',
] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  TEST_DATABASE_URL?: string;
}
