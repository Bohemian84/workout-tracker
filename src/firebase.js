import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCjapFGEJLt9ymgPDQsUqznMjFMRSXSYL0",
  authDomain: "workout-tracker-17655.firebaseapp.com",
  projectId: "workout-tracker-17655",
  storageBucket: "workout-tracker-17655.firebasestorage.app",
  messagingSenderId: "41042891144",
  appId: "1:41042891144:web:e71d7ac9adfa89d5912a3d"
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);

const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const googleProvider = new GoogleAuthProvider();
