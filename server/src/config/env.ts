import { config } from 'dotenv';
import { fileURLToPath } from 'url';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

config({ path: rootEnvPath });
