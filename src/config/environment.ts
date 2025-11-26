import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EnvironmentConfig {
  projectId: string;
  serviceAccountPath: string;
  maxTimeRangeDays: number;
  rateLimit: {
    perTool: number;
    global: number;
  };
}

const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';

export function loadEnvironment(): EnvironmentConfig {
  const configPath = path.join(__dirname, '../../config/environments.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Environment config not found at ${configPath}`);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configContent);

  if (!config[ENVIRONMENT]) {
    throw new Error(
      `Environment "${ENVIRONMENT}" not found in environments.json. ` +
      `Available environments: ${Object.keys(config).join(', ')}`
    );
  }

  return config[ENVIRONMENT];
}

export const currentEnv = loadEnvironment();
export const environmentName = ENVIRONMENT;
