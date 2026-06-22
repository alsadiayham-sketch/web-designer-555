const DEFAULT_PRODUCTS = [];

const DEFAULT_DISCOUNTS = [];

const DEFAULT_SITE_SETTINGS = {
    whatsappNumber: '0599000000',
    heroSubtitle: 'حقائب، اساور، واكسسوارات بأسعار مميزة وتوصيل لكل فلسطين',
    aboutText: 'Zoom Store وجهتكِ للحقائب الأنيقة والاساور الماركة والاكسسوارات المميزة في طولكرم.\n\nننتقي لكِ قطعاً بجودة عالية وأسعار منافسة، مع خدمة سريعة واهتمام بكل طلب من أول رسالة حتى التسليم.',
    instagramLink: 'https://www.instagram.com/zoom_store_tulkarm2'
};

const BRANDS_DATA = [
    { name: 'Dior', logo: '' },
    { name: 'Guess', logo: '' },
    { name: 'Michael Kors', logo: '' },
    { name: 'Coach', logo: '' },
    { name: 'Calvin Klein', logo: '' },
    { name: 'Pandora', logo: '' }
];

function normalizeSizeEntry(entry) {
    if (!entry) return { size: '', unit: 'size', price: 0 };
    return {
        size: String(entry.size || '').trim(),
        unit: String(entry.unit || 'size').trim() || 'size',
        price: Number(entry.price) || 0
    };
}

function normalizeProduct(product) {
    const sizes = Array.isArray(product && product.sizes) && product.sizes.length
        ? product.sizes.map(normalizeSizeEntry)
        : [normalizeSizeEntry({ size: product && product.size, unit: product && product.unit, price: product && product.price })];

    return {
        id: Number(product && product.id) || Date.now(),
        name: (product && product.name) || '',
        brand: (product && product.brand) || '',
        category: (product && product.category) || '',
        sizes: sizes.filter(function (size) { return size.size && size.price >= 0; }),
        discount: Number(product && product.discount) || 0,
        image: (product && product.image) || '',
        status: (product && product.status) || 'normal'
    };
}

function normalizeProducts(list) {
    return (Array.isArray(list) ? list : []).map(normalizeProduct).sort(function (a, b) { return a.id - b.id; });
}

function normalizeDiscount(discount) {
    var values = [];
    if (discount && discount.values && Array.isArray(discount.values)) values = discount.values;
    else if (discount && discount.value) values = String(discount.value).split(',').map(function (v) { return v.trim(); }).filter(Boolean);
    return {
        id: String(discount && discount.id ? discount.id : Date.now()),
        type: ['brand', 'category', 'manual', 'all'].indexOf(discount && discount.type) >= 0 ? discount.type : 'manual',
        value: values.join(', '),
        values: values,
        percentage: Number(discount && discount.percentage) || 0,
        description: String(discount && discount.description ? discount.description : '').trim(),
        expiresAt: discount && discount.expiresAt ? discount.expiresAt : ''
    };
}

function normalizeDiscounts(list) {
    return (Array.isArray(list) ? list : []).map(normalizeDiscount);
}

function extractWhatsappNumber(input) {
    const raw = String(input || '').trim();
    if (!raw) return DEFAULT_SITE_SETTINGS.whatsappNumber;
    const fromLink = raw.indexOf('wa.me/') >= 0 ? raw.split('wa.me/')[1] : raw;
    return fromLink.replace(/[^\d]/g, '');
}

function buildWhatsAppUrl(number, message) {
    const safeNumber = extractWhatsappNumber(number);
    const text = message ? '?text=' + encodeURIComponent(message) : '';
    return 'https://wa.me/' + safeNumber + text;
}

function normalizeSettings(settings) {
    const source = settings || {};
    return {
        whatsappNumber: extractWhatsappNumber(source.whatsappNumber || source.whatsappLink || DEFAULT_SITE_SETTINGS.whatsappNumber),
        heroSubtitle: String(source.heroSubtitle || DEFAULT_SITE_SETTINGS.heroSubtitle),
        aboutText: String(source.aboutText || DEFAULT_SITE_SETTINGS.aboutText),
        instagramLink: String(source.instagramLink || DEFAULT_SITE_SETTINGS.instagramLink)
    };
}

function getSizeData(product, sizeIdx) {
    if (!product || !Array.isArray(product.sizes) || !product.sizes.length) return { size: '', unit: 'size', price: 0 };
    const safeIndex = Math.max(0, Math.min(Number(sizeIdx) || 0, product.sizes.length - 1));
    return product.sizes[safeIndex];
}

function getUnitLabel(unit) {
    return {
        g: 'غرام',
        ml: 'مل',
        mm: 'مم',
        cm: 'سم',
        ring: 'مقاس',
        size: '',
        piece: 'قطعة',
        one: 'قياس موحد'
    }[unit] || unit;
}

function getSizeLabel(sizeData) {
    if (!sizeData) return '';
    if (sizeData.unit === 'size' && String(sizeData.size).toLowerCase() === 'one size') return 'قياس موحد';
    const label = getUnitLabel(sizeData.unit);
    if (!label) return String(sizeData.size || '');
    if (!sizeData.size) return label;
    if (sizeData.unit === 'ring') return label + ' ' + String(sizeData.size);
    return String(sizeData.size) + ' ' + label;
}

function getProductDiscountPercent(product, discounts) {
    let discountPercent = Number(product && product.discount) || 0;
    var now = new Date().toISOString().slice(0, 10);
    normalizeDiscounts(discounts).forEach(function (discount) {
        if (discount.expiresAt && discount.expiresAt < now) return;
        if (discount.type === 'all') discountPercent = Math.max(discountPercent, discount.percentage);
        if (discount.type === 'brand' && discount.values.indexOf(product.brand) >= 0) discountPercent = Math.max(discountPercent, discount.percentage);
        if (discount.type === 'category' && discount.values.indexOf(product.category) >= 0) discountPercent = Math.max(discountPercent, discount.percentage);
    });
    return discountPercent;
}

function getFinalPrice(product, sizeIdx, discounts) {
    const sizeData = getSizeData(product, sizeIdx);
    const discountPercent = getProductDiscountPercent(product, discounts || []);
    if (discountPercent > 0) {
        return {
            original: Number(sizeData.price) || 0,
            final: Math.round((Number(sizeData.price) || 0) * (1 - discountPercent / 100)),
            hasDiscount: true,
            discountPercent: discountPercent
        };
    }

    return {
        original: Number(sizeData.price) || 0,
        final: Number(sizeData.price) || 0,
        hasDiscount: false,
        discountPercent: 0
    };
}

function normalizeCartItems(cartItems, productsList) {
    const safeProducts = Array.isArray(productsList) ? productsList : normalizeProducts(DEFAULT_PRODUCTS);
    return (Array.isArray(cartItems) ? cartItems : []).map(function (item) {
        const product = safeProducts.find(function (entry) { return entry.id === Number(item.id || item.productId); });
        const maxSizeIndex = product && product.sizes.length ? product.sizes.length - 1 : 0;
        const requestedSize = Number.isInteger(item.sizeIdx) ? item.sizeIdx : parseInt(item.sizeIdx || 0, 10) || 0;
        const sizeIdx = Math.max(0, Math.min(requestedSize, maxSizeIndex));
        return {
            id: Number(item.id || item.productId),
            sizeIdx: sizeIdx,
            qty: Math.max(1, parseInt(item.qty || 1, 10) || 1),
            price: Number(item.price) || (product ? getSizeData(product, sizeIdx).price : 0)
        };
    }).filter(function (item) {
        return item.id;
    });
}

function formatCurrency(value) {
    return '₪' + (Number(value) || 0);
}

function formatDateTime(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('ar-PS', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function makeOrderId() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let idx = 0; idx < 5; idx += 1) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return 'ORD-' + code;
}
