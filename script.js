const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='18' fill='%231e1e30'/%3E%3Cpath d='M60 18c-14 4-24 17-24 32 0 19 15 34 34 34 4 0 8-.6 11-2-5 8-15 13-26 13-17 0-31-14-31-31 0-20 18-38 36-46z' fill='%23c9a96e'/%3E%3C/svg%3E";

let products = [];
let discounts = [];
let siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
let currentFilter = 'all';
let cart = normalizeCartItems(JSON.parse(localStorage.getItem('zoom_cart') || '[]'), normalizeProducts(DEFAULT_PRODUCTS));
let deliveryMethod = localStorage.getItem('zoom_delivery_method') || 'pickup';
let currentPDPProduct = null;
let currentPDPSizeIdx = 0;
let pdpQty = 1;
let usedFallbackData = false;
let unsubscribers = [];

const storeLoadState = {
    products: false,
    discounts: false,
    settings: false
};

document.addEventListener('DOMContentLoaded', function () {
    saveCart();
    renderBrands();
    setupSearch('navSearchInput', 'navSearchDropdown');
    setupSearch('productsSearchInput', 'productsSearchDropdown');
    updateCartBadge();
    updateCheckoutLink(cart.length ? updateCartTotal() : 0);
    setDeliveryMethod(deliveryMethod);
    setLoadingState(true);
    subscribeToStoreData();
    // Fallback if Firestore takes too long
    setTimeout(function () {
        if (!storeLoadState.products || !storeLoadState.discounts || !storeLoadState.settings) {
            applyFallbackStoreData('');
        }
    }, 6000);
});

function setLoadingState(isLoading) {
    var loading = document.getElementById('storeLoading');
    var grid = document.getElementById('productsGrid');
    if (loading) loading.style.display = isLoading ? 'flex' : 'none';
    if (grid) grid.classList.toggle('is-loading', !!isLoading);
}

function setStoreMessage(message, type) {
    var notice = document.getElementById('storeNotice');
    if (!notice) return;
    if (!message) {
        notice.style.display = 'none';
        notice.textContent = '';
        notice.className = 'store-notice';
        return;
    }
    notice.textContent = message;
    notice.className = 'store-notice ' + (type || 'info');
    notice.style.display = 'block';
}

function markStoreLoaded(key) {
    storeLoadState[key] = true;
    if (storeLoadState.products && storeLoadState.discounts && storeLoadState.settings) {
        setLoadingState(false);
        renderStorefront();
    }
}

function subscribeToStoreData() {
    if (!window.db) {
        applyFallbackStoreData('تعذر الاتصال بفايربيس، تم عرض البيانات الاحتياطية.');
        return;
    }

    unsubscribers.forEach(function (unsubscribe) {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
    unsubscribers = [];

    // Phase 1: Load first 6 products fast
    db.collection('products').orderBy('id').limit(6).get().then(function (snapshot) {
        if (!snapshot.empty) {
            products = snapshot.docs.map(function (docSnap) {
                return normalizeProduct(docSnap.data());
            }).sort(function (a, b) { return a.id - b.id; });
            syncCartWithProducts();
            markStoreLoaded('products');
        }
    }).catch(function () {}).then(function () {
        // Phase 2: Subscribe to full collection for remaining products + real-time updates
        unsubscribers.push(db.collection('products').onSnapshot(function (snapshot) {
            products = snapshot.docs.map(function (docSnap) {
                return normalizeProduct(docSnap.data());
            }).sort(function (a, b) { return a.id - b.id; });
            syncCartWithProducts();
            markStoreLoaded('products');
        }, function () {
            if (!storeLoadState.products) applyFallbackStoreData('تعذر تحميل المنتجات من فايرستور، تم استخدام البيانات الاحتياطية.');
            else setStoreMessage('تعذر تحديث المنتجات حالياً.', 'error');
        }));
    });

    unsubscribers.push(db.collection('discounts').onSnapshot(function (snapshot) {
        discounts = snapshot.docs.map(function (docSnap) {
            return normalizeDiscount(docSnap.data());
        });
        markStoreLoaded('discounts');
    }, function () {
        discounts = normalizeDiscounts(DEFAULT_DISCOUNTS);
        markStoreLoaded('discounts');
        setStoreMessage('تعذر تحميل الخصومات الحالية.', 'warning');
    }));

    unsubscribers.push(db.collection('settings').doc('config').onSnapshot(function (docSnap) {
        siteSettings = normalizeSettings(docSnap.exists ? docSnap.data() : DEFAULT_SITE_SETTINGS);
        markStoreLoaded('settings');
    }, function () {
        siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
        markStoreLoaded('settings');
        setStoreMessage('تعذر تحميل إعدادات المتجر الحالية.', 'warning');
    }));
}

function applyFallbackStoreData(message) {
    usedFallbackData = true;
    products = normalizeProducts(DEFAULT_PRODUCTS);
    discounts = normalizeDiscounts(DEFAULT_DISCOUNTS);
    siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
    storeLoadState.products = true;
    storeLoadState.discounts = true;
    storeLoadState.settings = true;
    syncCartWithProducts();
    setStoreMessage(message, 'warning');
    setLoadingState(false);
    renderStorefront();
}

function syncCartWithProducts() {
    cart = normalizeCartItems(cart, products);
    saveCart();
}

function renderStorefront() {
    applySettings();
    renderFilters();
    checkDiscountBanner();
    updateCartBadge();
    renderProducts(getFilteredProducts(currentFilter));
    updateCheckoutLink(updateCartTotal());
    if (!usedFallbackData) setStoreMessage('', 'info');
}

function applySettings() {
    var heroSub = document.getElementById('heroSubtitle');
    if (heroSub) heroSub.textContent = siteSettings.heroSubtitle;

    var aboutText = document.getElementById('aboutText');
    if (aboutText) aboutText.innerHTML = siteSettings.aboutText.replace(/\n/g, '<br>');

    var whatsappLink = document.getElementById('whatsappLink');
    if (whatsappLink) whatsappLink.href = buildWhatsAppUrl(siteSettings.whatsappNumber);

    var instagramLink = document.getElementById('instagramLink');
    if (instagramLink) instagramLink.href = siteSettings.instagramLink;

}

function checkDiscountBanner() {
    var banner = document.getElementById('discountBanner');
    var textNode = document.getElementById('bannerText');
    if (!banner || !textNode) return;

    var now = new Date().toISOString().slice(0, 10);
    var activeDiscounts = discounts.filter(function (discount) {
        if (!discount.description) return false;
        if (discount.expiresAt && discount.expiresAt < now) return false;
        return true;
    });

    if (activeDiscounts.length) {
        document.body.classList.add('has-banner');
        banner.style.display = 'block';
        var text = activeDiscounts.map(function (discount) {
            return discount.description;
        }).join('     |     ');
        textNode.textContent = text + '     |     ' + text;
    } else {
        document.body.classList.remove('has-banner');
        banner.style.display = 'none';
        textNode.textContent = '';
    }
}

function getFilteredProducts(filter) {
    if (filter === 'bestseller' || filter === 'special' || filter === 'soldout') {
        return products.filter(function (product) {
            return product.status === filter;
        });
    }

    if (filter !== 'all') {
        return products.filter(function (product) {
            return product.category === filter || product.brand === filter;
        });
    }

    return products.slice();
}

function getPriceHTML(pricing) {
    return (pricing.hasDiscount ? '<span class="original-price">' + formatCurrency(pricing.original) + '</span>' : '') + '<span>' + formatCurrency(pricing.final) + '</span>';
}

function renderProducts(productsToShow) {
    var grid = document.getElementById('productsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!productsToShow.length) {
        grid.innerHTML = '<div class="empty-products">لا توجد منتجات متاحة حالياً.</div>';
        return;
    }

    productsToShow.forEach(function (product) {
        var sizeData = getSizeData(product, 0);
        var pricing = getFinalPrice(product, 0, discounts);
        var statusBadge = getStatusBadge(product.status);
        var discountBadge = pricing.hasDiscount ? '<span class="discount-badge">-' + pricing.discountPercent + '%</span>' : '';
        var soldOutClass = product.status === 'soldout' ? 'sold-out' : '';
        var sizeSelector = product.sizes.length > 1
            ? '<div class="card-size-selector"><label for="sizeSelect-' + product.id + '">الحجم:</label><select id="sizeSelect-' + product.id + '" class="size-select" onclick="event.stopPropagation()" onchange="updateProductSize(' + product.id + ', this.value)">' + product.sizes.map(function (size, idx) { return '<option value="' + idx + '">' + getSizeLabel(size) + '</option>'; }).join('') + '</select></div>'
            : '<div class="card-size-single"><span>الحجم:</span><strong>' + getSizeLabel(sizeData) + '</strong></div>';

        var card = document.createElement('div');
        card.className = 'product-card ' + soldOutClass;
        card.dataset.productId = String(product.id);
        card.innerHTML = [
            discountBadge,
            statusBadge,
            '<div class="product-image" onclick="openPDP(' + product.id + ')" style="cursor:pointer;">',
            '<img src="' + product.image + '" alt="' + product.name + '" loading="lazy" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">',
            '</div>',
            '<div class="product-info" onclick="openPDP(' + product.id + ')" style="cursor:pointer;">',
            '<span class="product-brand">' + product.brand + '</span>',
            '<h3>' + product.name + '</h3>',
            '<div class="product-meta"><span>' + product.category + '</span><span class="product-size" id="productSize-' + product.id + '">' + getSizeLabel(sizeData) + '</span></div>',
            '<div class="product-price" id="productPrice-' + product.id + '">' + getPriceHTML(pricing) + '</div>',
            '</div>',
            '<div class="product-card-controls">' + sizeSelector + '</div>',
            '<div class="product-card-actions">',
            '<div class="qty-selector qty-sm" id="qty-' + product.id + '"><button onclick="event.stopPropagation(); changeCardQty(' + product.id + ', -1)">−</button><span id="cardQty-' + product.id + '">1</span><button onclick="event.stopPropagation(); changeCardQty(' + product.id + ', 1)">+</button></div>',
            '<button class="btn-add-cart" onclick="addToCart(event, ' + product.id + ')" ' + (product.status === 'soldout' ? 'disabled' : '') + '>' + (product.status === 'soldout' ? 'نفذت الكمية' : 'أضيفي') + '</button>',
            '</div>'
        ].join('');
        grid.appendChild(card);
    });
}

function updateProductSize(productId, sizeIdx) {
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product) return;
    var sizeData = getSizeData(product, sizeIdx);
    var pricing = getFinalPrice(product, sizeIdx, discounts);
    var sizeEl = document.getElementById('productSize-' + productId);
    var priceEl = document.getElementById('productPrice-' + productId);
    if (sizeEl) sizeEl.textContent = getSizeLabel(sizeData);
    if (priceEl) priceEl.innerHTML = getPriceHTML(pricing);
}

function getStatusBadge(status) {
    switch (status) {
        case 'bestseller': return '<span class="status-badge bestseller">الأكثر مبيعاً</span>';
        case 'special': return '<span class="status-badge special">مميز</span>';
        case 'soldout': return '<span class="status-badge soldout">نفذت الكمية</span>';
        default: return '';
    }
}

function filterProducts(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(function (button) {
        button.classList.remove('active');
    });
    var activeBtn = document.querySelector('[data-filter="' + filter + '"]');
    if (activeBtn) activeBtn.classList.add('active');
    renderProducts(getFilteredProducts(filter));
}

function toggleFilters() {
    var panel = document.getElementById('filterPanel');
    var btn = document.querySelector('.filter-toggle-btn');
    if (!panel || !btn) return;
    var isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? 'فلتر ▲' : 'فلتر ▼';
}

function createFilterButton(value) {
    var button = document.createElement('button');
    button.className = 'filter-btn';
    button.dataset.filter = value;
    button.textContent = value;
    button.addEventListener('click', function () {
        filterProducts(value);
    });
    return button;
}

function renderFilters() {
    var categories = Array.from(new Set(products.map(function (product) { return product.category; })));
    var brands = Array.from(new Set(products.map(function (product) { return product.brand; })));
    var catContainer = document.getElementById('categoryFilters');
    var brandContainer = document.getElementById('brandFilters');
    if (!catContainer || !brandContainer) return;
    catContainer.innerHTML = '';
    brandContainer.innerHTML = '';
    categories.forEach(function (category) { catContainer.appendChild(createFilterButton(category)); });
    brands.forEach(function (brand) { brandContainer.appendChild(createFilterButton(brand)); });
}

function renderBrands() {
    var grid = document.getElementById('brandsGrid');
    if (!grid) return;
    grid.innerHTML = BRANDS_DATA.map(function (brand) {
        return '<div class="brand-tile"><span>' + brand.name + '</span></div>';
    }).join('');
}


function setupSearch(inputId, dropdownId) {
    var input = document.getElementById(inputId);
    var dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    input.addEventListener('input', function () {
        var query = this.value.trim();
        if (query.length < 2) {
            dropdown.classList.remove('active');
            return;
        }

        var results = products.filter(function (product) {
            return product.name.indexOf(query) >= 0 || product.category.indexOf(query) >= 0 || product.brand.toLowerCase().indexOf(query.toLowerCase()) >= 0;
        }).slice(0, 8);

        if (!results.length) {
            dropdown.innerHTML = '<div class="search-item"><div class="search-item-info"><h4>لا توجد نتائج</h4></div></div>';
        } else {
            dropdown.innerHTML = results.map(function (product) {
                var pricing = getFinalPrice(product, 0, discounts);
                return '<div class="search-item" onclick="scrollToProduct(' + product.id + ')"><img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"><div class="search-item-info"><h4>' + product.name + '</h4><span>' + product.brand + ' • ' + product.category + ' • ' + getSizeLabel(getSizeData(product, 0)) + ' • ' + formatCurrency(pricing.final) + '</span></div></div>';
            }).join('');
        }
        dropdown.classList.add('active');
    });

    document.addEventListener('click', function (event) {
        if (!input.contains(event.target) && !dropdown.contains(event.target)) dropdown.classList.remove('active');
    });
}

function scrollToProduct(productId) {
    filterProducts('all');
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    document.querySelectorAll('.search-dropdown').forEach(function (dropdown) { dropdown.classList.remove('active'); });
    document.querySelectorAll('.nav-search input, .products-search input').forEach(function (input) { input.value = ''; });
    setTimeout(function () {
        var card = document.querySelector('.product-card[data-product-id="' + productId + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
}

function toggleMobileMenu() {
    document.getElementById('mobileMenu').classList.toggle('active');
}

document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (event) {
        event.preventDefault();
        var target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

window.addEventListener('scroll', function () {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;
    navbar.style.boxShadow = window.scrollY > 50 ? '0 4px 20px rgba(0,0,0,0.1)' : '0 2px 10px rgba(0,0,0,0.05)';
});

function getSelectedCardSizeIndex(productId) {
    var select = document.getElementById('sizeSelect-' + productId);
    return select ? parseInt(select.value || '0', 10) || 0 : 0;
}

function addToCart(event, productId) {
    event.stopPropagation();
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product || product.status === 'soldout') return;

    var qty = parseInt(document.getElementById('cardQty-' + productId).textContent, 10) || 1;
    var sizeIdx = getSelectedCardSizeIndex(productId);
    var pricing = getFinalPrice(product, sizeIdx, discounts);
    var btn = event.currentTarget;
    var img = btn.closest('.product-card').querySelector('.product-image img');
    flyToCart(img, product);

    var existing = cart.find(function (item) { return item.id === productId && item.sizeIdx === sizeIdx; });
    if (existing) existing.qty += qty;
    else cart.push({ id: productId, sizeIdx: sizeIdx, qty: qty, price: pricing.final });

    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());

    btn.textContent = 'تمت الإضافة';
    btn.classList.add('added');
    setTimeout(function () {
        btn.textContent = 'أضيفي';
        btn.classList.remove('added');
    }, 1500);

    document.getElementById('cardQty-' + productId).textContent = '1';
}

function flyToCart(imgElement, product) {
    var cartIcon = document.getElementById('cartIcon');
    if (!imgElement || !cartIcon) return;

    var imgRect = imgElement.getBoundingClientRect();
    var cartRect = cartIcon.getBoundingClientRect();

    // Create bubble element
    var bubble = document.createElement('div');
    bubble.className = 'cart-bubble';
    bubble.textContent = product.name;
    document.body.appendChild(bubble);

    // Position at product center
    var startX = imgRect.left + imgRect.width / 2;
    var startY = imgRect.top + imgRect.height / 2;
    bubble.style.left = startX + 'px';
    bubble.style.top = startY + 'px';

    // Calculate destination (cart icon center)
    var endX = cartRect.left + cartRect.width / 2;
    var endY = cartRect.top + cartRect.height / 2;
    var dx = endX - startX;
    var dy = endY - startY;

    bubble.style.setProperty('--bubble-dx', dx + 'px');
    bubble.style.setProperty('--bubble-dy', dy + 'px');

    // Trigger animation
    requestAnimationFrame(function () {
        bubble.classList.add('animate');
    });

    // Cart shake after bubble arrives
    setTimeout(function () {
        cartIcon.classList.add('cart-shake');
        setTimeout(function () { cartIcon.classList.remove('cart-shake'); }, 600);
    }, 800);

    // Clean up bubble
    setTimeout(function () {
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 1100);
}

function changeCardQty(productId, delta) {
    var span = document.getElementById('cardQty-' + productId);
    if (!span) return;
    var qty = (parseInt(span.textContent, 10) || 1) + delta;
    if (qty < 1) qty = 1;
    if (qty > 99) qty = 99;
    span.textContent = qty;
}

function updateCartBadge() {
    var badge = document.getElementById('cartBadge');
    if (!badge) return;
    var totalItems = cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
    if (totalItems > 0) {
        badge.style.display = 'flex';
        badge.textContent = totalItems;
    } else {
        badge.style.display = 'none';
    }
}

function toggleCart() {
    var sidebar = document.getElementById('cartSidebar');
    var overlay = document.getElementById('cartOverlay');
    if (!sidebar || !overlay) return;
    var isOpen = sidebar.classList.contains('active');

    if (isOpen) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderCart();
    }
}

function renderCart() {
    var container = document.getElementById('cartItems');
    var footer = document.getElementById('cartFooter');
    if (!container || !footer) return;

    if (!cart.length) {
        container.innerHTML = '<div class="cart-empty"><span>🛒</span><p>السلة فارغة</p></div>';
        footer.style.display = 'none';
        updateCheckoutLink(0);
        return;
    }

    footer.style.display = 'block';
    container.innerHTML = cart.map(function (item) {
        var product = products.find(function (entry) { return entry.id === item.id; });
        if (!product) return '';
        var sizeData = getSizeData(product, item.sizeIdx);
        var pricing = getFinalPrice(product, item.sizeIdx, discounts);
        return '<div class="cart-item"><img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"><div class="cart-item-info"><h4>' + product.name + '</h4><span class="cart-item-brand">' + product.brand + ' • ' + getSizeLabel(sizeData) + '</span><div class="cart-item-price">' + formatCurrency(pricing.final * item.qty) + '</div></div><div class="cart-item-qty"><button onclick="updateCartQty(' + item.id + ', ' + item.sizeIdx + ', -1)">−</button><span>' + item.qty + '</span><button onclick="updateCartQty(' + item.id + ', ' + item.sizeIdx + ', 1)">+</button></div><button class="cart-item-remove" onclick="removeFromCart(' + item.id + ', ' + item.sizeIdx + ')">✕</button></div>';
    }).join('');

    updateCheckoutLink(updateCartTotal());
}

function updateCartQty(productId, sizeIdx, delta) {
    var item = cart.find(function (entry) { return entry.id === productId && entry.sizeIdx === sizeIdx; });
    if (!item) return;
    item.qty += delta;
    if (item.qty < 1) {
        removeFromCart(productId, sizeIdx);
        return;
    }
    saveCart();
    updateCartBadge();
    renderCart();
}

function removeFromCart(productId, sizeIdx) {
    cart = cart.filter(function (entry) {
        return !(entry.id === productId && entry.sizeIdx === sizeIdx);
    });
    saveCart();
    updateCartBadge();
    renderCart();
}

function clearCart() {
    cart = [];
    saveCart();
    updateCartBadge();
    renderCart();
}

function updateCartTotal() {
    var total = cart.reduce(function (sum, item) {
        var product = products.find(function (entry) { return entry.id === item.id; });
        return product ? sum + getFinalPrice(product, item.sizeIdx, discounts).final * item.qty : sum;
    }, 0);
    var totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = formatCurrency(total);
    return total;
}

function updateCheckoutLink(total) {
    var btn = document.getElementById('checkoutBtn');
    if (!btn) return;
    btn.href = 'checkout.html';
    btn.classList.toggle('disabled', total === 0);
}

function saveCart() {
    localStorage.setItem('zoom_cart', JSON.stringify(normalizeCartItems(cart, products.length ? products : normalizeProducts(DEFAULT_PRODUCTS))));
}

function setDeliveryMethod(method) {
    deliveryMethod = method;
    localStorage.setItem('zoom_delivery_method', method);
    var pickupBtn = document.getElementById('optPickup');
    var deliveryBtn = document.getElementById('optDelivery');
    if (pickupBtn) pickupBtn.classList.toggle('active', method === 'pickup');
    if (deliveryBtn) deliveryBtn.classList.toggle('active', method === 'delivery');
}

function openPDP(productId) {
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product) return;

    currentPDPProduct = product;
    currentPDPSizeIdx = 0;
    pdpQty = 1;

    document.getElementById('pdpImage').innerHTML = '<img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">';
    document.getElementById('pdpBrand').textContent = product.brand;
    document.getElementById('pdpName').textContent = product.name;
    document.getElementById('pdpQty').textContent = '1';
    renderPDPSizeOptions();
    updatePDPDisplay();

    var addBtn = document.getElementById('pdpAddBtn');
    if (product.status === 'soldout') {
        addBtn.textContent = 'نفذت الكمية';
        addBtn.disabled = true;
        addBtn.style.background = '#9ca3af';
    } else {
        addBtn.textContent = 'أضيفي للسلة';
        addBtn.disabled = false;
        addBtn.style.background = '';
    }

    document.getElementById('pdpModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function renderPDPSizeOptions() {
    var section = document.getElementById('pdpSizeSection');
    var container = document.getElementById('pdpSizes');
    if (!currentPDPProduct || !section || !container) return;

    if (currentPDPProduct.sizes.length <= 1) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    section.style.display = 'flex';
    container.innerHTML = currentPDPProduct.sizes.map(function (size, idx) {
        return '<button type="button" class="pdp-size-btn ' + (idx === currentPDPSizeIdx ? 'active' : '') + '" onclick="selectPDPSize(' + idx + ')">' + getSizeLabel(size) + '</button>';
    }).join('');
}

function selectPDPSize(sizeIdx) {
    currentPDPSizeIdx = sizeIdx;
    renderPDPSizeOptions();
    updatePDPDisplay();
}

function updatePDPDisplay() {
    if (!currentPDPProduct) return;
    var sizeData = getSizeData(currentPDPProduct, currentPDPSizeIdx);
    var pricing = getFinalPrice(currentPDPProduct, currentPDPSizeIdx, discounts);
    document.getElementById('pdpMeta').innerHTML = '<span>' + currentPDPProduct.category + '</span><span>' + getSizeLabel(sizeData) + '</span>';
    document.getElementById('pdpPrice').innerHTML = (pricing.hasDiscount ? '<span class="original-price">' + formatCurrency(pricing.original) + '</span>' : '') + '<span class="final-price">' + formatCurrency(pricing.final) + '</span>';
}

function closePDP(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('pdpModal').style.display = 'none';
    document.body.style.overflow = '';
    currentPDPProduct = null;
}

function changePDPQty(delta) {
    pdpQty += delta;
    if (pdpQty < 1) pdpQty = 1;
    if (pdpQty > 99) pdpQty = 99;
    document.getElementById('pdpQty').textContent = pdpQty;
}

function addFromPDP() {
    if (!currentPDPProduct || currentPDPProduct.status === 'soldout') return;

    var pricing = getFinalPrice(currentPDPProduct, currentPDPSizeIdx, discounts);
    var existing = cart.find(function (item) { return item.id === currentPDPProduct.id && item.sizeIdx === currentPDPSizeIdx; });
    if (existing) existing.qty += pdpQty;
    else cart.push({ id: currentPDPProduct.id, sizeIdx: currentPDPSizeIdx, qty: pdpQty, price: pricing.final });

    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());

    var img = document.querySelector('#pdpImage img');
    if (img) flyToCart(img, currentPDPProduct);

    var btn = document.getElementById('pdpAddBtn');
    btn.textContent = 'تمت الإضافة';
    btn.classList.add('added');
    setTimeout(function () {
        btn.textContent = 'أضيفي للسلة';
        btn.classList.remove('added');
        closePDP();
    }, 1200);
}
