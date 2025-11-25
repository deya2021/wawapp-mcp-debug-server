import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { currentEnv, environmentName } from '../config/environment.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let initialized = false;

export function initializeFirebase(): void {
  if (initialized) return;

  const serviceAccountPath = path.isAbsolute(currentEnv.serviceAccountPath)
    ? currentEnv.serviceAccountPath
    : path.join(__dirname, '../../', currentEnv.serviceAccountPath);

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Service account file not found at: ${serviceAccountPath}\n` +
      `Current environment: ${environmentName}\n` +
      `Please ensure the service account JSON file exists.`
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, 'utf-8')
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: currentEnv.projectId,
  });

  console.error(
    `[Firebase] Initialized for project: ${currentEnv.projectId} (${environmentName})`
  );

  initialized = true;
}

export function getFirestore(): FirebaseFirestore.Firestore {
  if (!initialized) initializeFirebase();
  return admin.firestore();
}

export function getAuth(): admin.auth.Auth {
  if (!initialized) initializeFirebase();
  return admin.auth();
}
