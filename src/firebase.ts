import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// experimentalForceLongPolling: WebSocket 대신 HTTP 롱폴링 사용
// → WebSocket 연결 실패 / 백오프 루프로 batch.commit()이 무한 hang하는 문제 해소
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
} as any, firebaseConfig.firestoreDatabaseId);

export const reviewDb = db;