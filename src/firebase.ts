import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// 리뷰 대시보드용 - (default) DB 연결
const reviewApp = getApps().find(a => a.name === 'review') || initializeApp(firebaseConfig, 'review');
export const reviewDb = getFirestore(reviewApp, '(default)');