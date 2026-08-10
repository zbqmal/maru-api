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
}
