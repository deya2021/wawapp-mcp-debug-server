import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CollectionMapping {
  collection: string;
  fields: Record<string, string>;
}

let mappings: Record<string, CollectionMapping> | null = null;

function loadMappings(): Record<string, CollectionMapping> {
  if (mappings !== null) {
    return mappings;
  }

  const configPath = path.join(__dirname, '../../config/collections.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Collections config not found at ${configPath}`);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const loaded: Record<string, CollectionMapping> = JSON.parse(configContent);
  mappings = loaded;
  return loaded;
}

export function getCollection(name: string): string {
  const m = loadMappings();
  return m[name]?.collection || name;
}

export function getField(collection: string, fieldName: string): string {
  const m = loadMappings();
  return m[collection]?.fields[fieldName] || fieldName;
}
