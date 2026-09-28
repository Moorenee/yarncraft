/**
 * YarnCraft Companion - Firebase Configuration & Initialization
 * Real Google Authentication & Multi-Device Cloud Firestore Sync
 * Project: yarncraft-ad7b5
 */

const firebaseConfig = {
  apiKey: "AIzaSyAINAyf54hrvj4kcc1KpwMEuTAbfE-dYBM",
  authDomain: "yarncraft-ad7b5.firebaseapp.com",
  projectId: "yarncraft-ad7b5",
  storageBucket: "yarncraft-ad7b5.firebasestorage.app",
  messagingSenderId: "908552115043",
  appId: "1:908552115043:web:fd2185de3d5342765df956",
  measurementId: "G-T8L47G6L5B"
};

// Initialize Firebase App, Auth, and Firestore
let firebaseAuth = null;
let firestoreDb = null;

if (typeof firebase !== 'undefined') {
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    firebaseAuth = firebase.auth();
    firestoreDb = firebase.firestore();
    
    // Enable offline persistence for Firestore if available
    firestoreDb.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore multi-tab persistence: active in another tab');
      } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not supported in this browser environment');
      }
    });

    window.firebaseApp = firebase.app();
    window.firebaseAuth = firebaseAuth;
    window.firestoreDb = firestoreDb;
    console.log('🔥 Firebase initialized successfully: project', firebaseConfig.projectId);
  } catch (err) {
    console.error('🔥 Firebase initialization error:', err);
  }
} else {
  console.warn('Firebase SDK not yet loaded.');
}
