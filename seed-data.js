async function seedFirestoreData(force) {
    if (!window.db) {
        throw new Error('Firebase غير جاهز حالياً.');
    }

    var shouldForce = !!force;
    var productsRef = db.collection('products');
    var discountsRef = db.collection('discounts');
    var settingsRef = db.collection('settings').doc('config');
    var existingProducts = await productsRef.limit(1).get();

    if (!shouldForce && !existingProducts.empty) {
        return { seeded: false, reason: 'not-empty' };
    }

    if (shouldForce) {
        var cleanupBatch = db.batch();
        var currentProducts = await productsRef.get();
        currentProducts.forEach(function (docSnap) {
            cleanupBatch.delete(docSnap.ref);
        });
        var currentDiscounts = await discountsRef.get();
        currentDiscounts.forEach(function (docSnap) {
            cleanupBatch.delete(docSnap.ref);
        });
        cleanupBatch.set(settingsRef, normalizeSettings(DEFAULT_SITE_SETTINGS), { merge: false });
        await cleanupBatch.commit();
    }

    var seedBatch = db.batch();
    normalizeProducts(DEFAULT_PRODUCTS).forEach(function (product) {
        seedBatch.set(productsRef.doc(String(product.id)), product, { merge: false });
    });

    seedBatch.set(settingsRef, normalizeSettings(DEFAULT_SITE_SETTINGS), { merge: true });

    normalizeDiscounts(DEFAULT_DISCOUNTS).forEach(function (discount) {
        seedBatch.set(discountsRef.doc(String(discount.id)), discount, { merge: false });
    });

    await seedBatch.commit();

    return {
        seeded: true,
        products: DEFAULT_PRODUCTS.length,
        discounts: DEFAULT_DISCOUNTS.length
    };
}

window.seedFirestoreData = seedFirestoreData;
