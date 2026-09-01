export const nodeEnvironments = ['test', 'development', 'production'] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  CORS_ALLOWED_ORIGINS: string[];
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  FRONTEND_URL: string;
  OPENAI_API_KEY: string | undefined;
  AWS_REGION: string;
  AWS_S3_BUCKET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
}
