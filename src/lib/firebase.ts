import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// @ts-ignore - This file is generated after the user connects a Firebase project.
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig as any);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

