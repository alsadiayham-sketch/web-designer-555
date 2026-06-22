(function (global) {
    if (typeof firebase === 'undefined') {
        console.error('Firebase SDK failed to load.');
        return;
    }

    var firebaseConfig = {
        apiKey: 'AIzaSyAIsq4QV6wxwMb8phPa3tU14p2NRSXvTdY',
        authDomain: 'dimaboutique-b4f16.firebaseapp.com',
        projectId: 'dimaboutique-b4f16',
        storageBucket: 'dimaboutique-b4f16.firebasestorage.app',
        messagingSenderId: '438611658146',
        appId: '1:438611658146:web:83b1a97cfc42bd12aadefb',
        measurementId: 'G-TWLMJT4Y8R'
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    var rawDb = firebase.firestore();
    var PROJECT_ID = 'zoomstore';
    var projectRef = rawDb.collection('projects').doc(PROJECT_ID);

    var db = {
        collection: function (name) {
            return projectRef.collection(name);
        },
        batch: function () {
            return rawDb.batch();
        },
        runTransaction: function (fn) {
            return rawDb.runTransaction(fn);
        }
    };

    global.firebaseConfig = firebaseConfig;
    global.db = db;
    global.rawDb = rawDb;
    global.projectRef = projectRef;
    global.PROJECT_ID = PROJECT_ID;
    global.dimaFirebase = {
        app: firebase.app(),
        db: db,
        rawDb: rawDb,
        FieldValue: firebase.firestore.FieldValue,
        Timestamp: firebase.firestore.Timestamp,
        collection: function (name) {
            return projectRef.collection(name);
        }
    };
})(window);
