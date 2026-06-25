const AUTH_REALM = 'store';
const ADMIN_TOKEN_KEY = 'zoom_admin_token';
const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='18' fill='%231e1e30'/%3E%3Cpath d='M60 18c-14 4-24 17-24 32 0 19 15 34 34 34 4 0 8-.6 11-2-5 8-15 13-26 13-17 0-31-14-31-31 0-20 18-38 36-46z' fill='%23c9a96e'/%3E%3C/svg%3E";

let products = [];
let discounts = [];
let orders = [];
let siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
let unsubscribers = [];
let charts = {};
let isInitializing = false;

const adminReady = {
    products: false,
    discounts: false,
    orders: false,
    settings: false
};

if (window.Chart) {
    Chart.defaults.color = '#d7d9e5';
    Chart.defaults.borderColor = 'rgba(226, 194, 117, 0.08)';
    Chart.defaults.font.family = 'Tajawal';
}

document.addEventListener('DOMContentLoaded', function () {
    var token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) return;
    fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, realm: AUTH_REALM })
    }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
        if (res.ok && res.d.ok) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            initializeAdmin();
        } else {
            sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        }
    }).catch(function () { sessionStorage.removeItem(ADMIN_TOKEN_KEY); });
});

function setAdminLoading(loading) {
    var loader = document.getElementById('adminLoading');
    if (loader) loader.style.display = loading ? 'block' : 'none';
}

var _statusTimeout = null;
function setAdminStatus(message, type) {
    var status = document.getElementById('adminStatus');
    if (!status) return;
    if (_statusTimeout) clearTimeout(_statusTimeout);
    status.classList.remove('hidden');
    status.textContent = message;
    status.className = 'admin-status' + (type ? ' ' + type : '');
    if (type === 'success') {
        _statusTimeout = setTimeout(function () {
            status.style.opacity = '0';
            setTimeout(function () {
                status.textContent = '';
                status.className = 'admin-status hidden';
                status.style.opacity = '';
            }, 500);
        }, 5000);
    }
}

function handleLogin(event) {
    event.preventDefault();
    const user = document.getElementById('loginUser').value;
    const pass = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realm: AUTH_REALM, username: user, password: pass })
    }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
        if (res.ok && res.d.ok) {
            sessionStorage.setItem(ADMIN_TOKEN_KEY, res.d.token);
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            initializeAdmin();
        } else {
            errEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
        }
    }).catch(function () {
        errEl.textContent = 'تعذر الاتصال بالخادم. حاول مرة أخرى.';
    });
}

function logout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    unsubscribers.forEach(function (unsubscribe) { if (typeof unsubscribe === 'function') unsubscribe(); });
    location.reload();
}

function switchTab(tab, button) {
    document.querySelectorAll('.tab-content').forEach(function (content) { content.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function (tabButton) { tabButton.classList.remove('active'); });
    document.getElementById('tab-' + tab).classList.add('active');
    if (button) button.classList.add('active');
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'orders') renderOrdersTable();
}

async function initializeAdmin() {
    if (isInitializing) return;
    isInitializing = true;
    setAdminLoading(true);
    setAdminStatus('جاري مزامنة فايرستور...', '');

    if (!window.db) {
        setAdminLoading(false);
        setAdminStatus('تعذر تهيئة فايربيس. تأكدي من الاتصال بالإنترنت.', 'error');
        isInitializing = false;
        return;
    }

    try {
        await ensureSeedIfEmpty();
        subscribeToCollections();
    } catch (error) {
        console.error(error);
        setAdminStatus('حدث خطأ أثناء تحميل البيانات.', 'error');
        setAdminLoading(false);
    }

    isInitializing = false;
}

async function ensureSeedIfEmpty() {
    const snapshot = await db.collection('products').limit(1).get();
    if (snapshot.empty) {
        setAdminStatus('المتجر فارغ، جاري تنفيذ Seed Data تلقائياً...', 'warning');
        await seedFirestoreData(false);
    }
}

function subscribeToCollections() {
    unsubscribers.forEach(function (unsubscribe) { if (typeof unsubscribe === 'function') unsubscribe(); });
    unsubscribers = [];

    unsubscribers.push(db.collection('products').onSnapshot(function (snapshot) {
        products = snapshot.docs.map(function (docSnap) { return normalizeProduct(docSnap.data()); }).sort(function (a, b) { return a.id - b.id; });
        adminReady.products = true;
        renderProductsTable();
        renderDiscountValueOptions();
        checkAdminReady();
    }, function (error) {
        console.error(error);
        setAdminStatus('تعذر تحميل المنتجات.', 'error');
        setAdminLoading(false);
    }));

    unsubscribers.push(db.collection('discounts').onSnapshot(function (snapshot) {
        discounts = snapshot.docs.map(function (docSnap) { return normalizeDiscount(docSnap.data()); });
        adminReady.discounts = true;
        renderDiscountsTable();
        checkAdminReady();
    }, function (error) {
        console.error(error);
        setAdminStatus('تعذر تحميل الخصومات.', 'error');
        setAdminLoading(false);
    }));

    unsubscribers.push(db.collection('orders').orderBy('date', 'desc').onSnapshot(function (snapshot) {
        orders = snapshot.docs.map(function (docSnap) {
            const data = docSnap.data();
            data._docId = docSnap.id;
            return data;
        });
        adminReady.orders = true;
        renderOrdersTable();
        renderDashboard();
        checkAdminReady();
    }, function (error) {
        console.error(error);
        setAdminStatus('تعذر تحميل الطلبات.', 'error');
        setAdminLoading(false);
    }));

    unsubscribers.push(db.collection('settings').doc('config').onSnapshot(function (docSnap) {
        siteSettings = normalizeSettings(docSnap.exists ? docSnap.data() : DEFAULT_SITE_SETTINGS);
        adminReady.settings = true;
        loadSettingsForm();
        checkAdminReady();
    }, function (error) {
        console.error(error);
        setAdminStatus('تعذر تحميل الإعدادات.', 'error');
        setAdminLoading(false);
    }));
}

function checkAdminReady() {
    if (adminReady.products && adminReady.discounts && adminReady.orders && adminReady.settings) {
        setAdminLoading(false);
        setAdminStatus('تمت مزامنة البيانات بنجاح.', 'success');
    }
}

function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    const statusLabels = { normal: 'عادي', bestseller: 'الأكثر مبيعاً', special: 'مميز', soldout: 'نفذت الكمية' };
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">لا توجد منتجات حالياً.</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(function (product) {
        return '<tr><td><input type="checkbox" class="product-select" value="' + product.id + '" onchange="updateBulkBar()"></td><td><img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"></td><td>' + product.name + '</td><td>' + product.brand + '</td><td>' + product.category + '</td><td>' + formatSizes(product) + '</td><td>' + formatPrices(product) + '</td><td>' + (product.discount ? product.discount + '%' : '-') + '</td><td><span class="status-tag ' + (product.status || 'normal') + '">' + statusLabels[product.status || 'normal'] + '</span></td><td class="actions"><button class="btn-edit" onclick="editProduct(' + product.id + ')">تعديل</button><button class="btn-delete" onclick="deleteProduct(' + product.id + ')">حذف</button></td></tr>';
    }).join('');
    updateBulkBar();
}

function getSelectedProductIds() {
    var checkboxes = document.querySelectorAll('.product-select:checked');
    var ids = [];
    for (var i = 0; i < checkboxes.length; i++) {
        ids.push(Number(checkboxes[i].value));
    }
    return ids;
}

function toggleSelectAll(masterCheckbox) {
    var checkboxes = document.querySelectorAll('.product-select');
    for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = masterCheckbox.checked;
    }
    updateBulkBar();
}

function updateBulkBar() {
    var selected = getSelectedProductIds();
    var bar = document.getElementById('bulkActionsBar');
    var count = document.getElementById('bulkSelectedCount');
    if (selected.length > 0) {
        bar.style.display = 'flex';
        count.textContent = selected.length;
    } else {
        bar.style.display = 'none';
    }
}

async function bulkChangeStatus() {
    var ids = getSelectedProductIds();
    var status = document.getElementById('bulkStatusSelect').value;
    if (!ids.length || !status) return;
    var batch = db.batch();
    ids.forEach(function (id) {
        batch.update(db.collection('products').doc(String(id)), { status: status });
    });
    await batch.commit();
    document.getElementById('bulkStatusSelect').value = '';
}

async function bulkApplyDiscount() {
    var ids = getSelectedProductIds();
    var discount = parseInt(document.getElementById('bulkDiscountInput').value, 10);
    if (!ids.length || isNaN(discount) || discount < 0 || discount > 99) return;
    var batch = db.batch();
    ids.forEach(function (id) {
        batch.update(db.collection('products').doc(String(id)), { discount: discount });
    });
    await batch.commit();
    document.getElementById('bulkDiscountInput').value = '';
}

async function bulkDeleteProducts() {
    var ids = getSelectedProductIds();
    if (!ids.length) return;
    if (!confirm('هل تريد حذف ' + ids.length + ' منتج؟')) return;
    var batch = db.batch();
    ids.forEach(function (id) {
        batch.delete(db.collection('products').doc(String(id)));
    });
    await batch.commit();
    var selectAll = document.getElementById('selectAllProducts');
    if (selectAll) selectAll.checked = false;
}

function formatSizes(product) {
    return product.sizes.map(function (size) { return getSizeLabel(size); }).join(' / ');
}

function formatPrices(product) {
    const prices = product.sizes.map(function (size) { return size.price; });
    if (!prices.length) return '-';
    if (prices.length === 1) return formatCurrency(prices[0]);
    return formatCurrency(Math.min.apply(null, prices)) + ' - ' + formatCurrency(Math.max.apply(null, prices));
}

function createEmptySize() { return { size: '', unit: 'size', price: '' }; }

function addSizeRow(sizeData) {
    const safeSize = sizeData || createEmptySize();
    const container = document.getElementById('sizesContainer');
    const row = document.createElement('div');
    row.className = 'size-row';
    row.innerHTML = '<input type="text" class="size-value" placeholder="القياس أو الحجم" value="' + safeSize.size + '"><select class="size-unit"><option value="size" ' + (safeSize.unit === 'size' ? 'selected' : '') + '>حجم / مقاس</option><option value="mm" ' + (safeSize.unit === 'mm' ? 'selected' : '') + '>مم (mm)</option><option value="cm" ' + (safeSize.unit === 'cm' ? 'selected' : '') + '>سم (cm)</option><option value="ring" ' + (safeSize.unit === 'ring' ? 'selected' : '') + '>خاتم</option><option value="piece" ' + (safeSize.unit === 'piece' ? 'selected' : '') + '>قطعة</option><option value="ml" ' + (safeSize.unit === 'ml' ? 'selected' : '') + '>مل (ml)</option><option value="g" ' + (safeSize.unit === 'g' ? 'selected' : '') + '>غرام (g)</option></select><input type="number" class="size-price" min="0" placeholder="السعر ₪" value="' + safeSize.price + '"><button type="button" class="btn-remove-size" onclick="removeSizeRow(this)">حذف</button>';
    container.appendChild(row);
}


function removeSizeRow(button) {
    const container = document.getElementById('sizesContainer');
    if (container.children.length === 1) return;
    button.closest('.size-row').remove();
}

function renderSizeRows(sizes) {
    const container = document.getElementById('sizesContainer');
    container.innerHTML = '';
    (sizes && sizes.length ? sizes : [createEmptySize()]).forEach(function (size) { addSizeRow(size); });
}

function openProductModal(product) {
    document.getElementById('productModalTitle').textContent = product ? 'تعديل المنتج' : 'إضافة منتج جديد';
    document.getElementById('productId').value = product ? product.id : '';
    document.getElementById('productName').value = product ? product.name : '';
    document.getElementById('productBrand').value = product ? product.brand : '';
    document.getElementById('productCategory').value = product ? product.category : '';
    document.getElementById('productDiscount').value = product ? product.discount : 0;
    document.getElementById('productImage').value = product ? product.image : '';
    document.getElementById('productImageFile').value = '';
    document.getElementById('imagePreview').innerHTML = product && product.image ? '<img src="' + product.image + '" onerror="this.style.display=\'none\'">' : '';
    document.getElementById('productStatus').value = product ? product.status : 'normal';
    renderSizeRows(product ? product.sizes : [createEmptySize()]);
    document.getElementById('brandsList').innerHTML = Array.from(new Set(products.map(function (entry) { return entry.brand; }))).map(function (brand) { return '<option value="' + brand + '">'; }).join('');
    document.getElementById('categoriesList').innerHTML = Array.from(new Set(products.map(function (entry) { return entry.category; }))).map(function (category) { return '<option value="' + category + '">'; }).join('');
    document.getElementById('productModal').style.display = 'flex';
}

function editProduct(id) {
    const product = products.find(function (entry) { return entry.id === id; });
    if (product) openProductModal(product);
}

function collectSizes() {
    return Array.from(document.querySelectorAll('#sizesContainer .size-row')).map(function (row) {
        return {
            size: row.querySelector('.size-value').value.trim(),
            unit: row.querySelector('.size-unit').value,
            price: parseFloat(row.querySelector('.size-price').value || '0')
        };
    }).filter(function (size) { return size.size && size.price > 0; });
}

async function saveProduct(event) {
    event.preventDefault();
    const id = document.getElementById('productId').value;
    const sizes = collectSizes();
    if (!sizes.length) return alert('أضيفي حجماً واحداً على الأقل مع السعر.');

    const nextId = id ? parseInt(id, 10) : (products.length ? Math.max.apply(null, products.map(function (entry) { return entry.id; })) + 1 : 1);

    // Handle image upload
    let imageUrl = document.getElementById('productImage').value.trim();
    const fileInput = document.getElementById('productImageFile');
    if (fileInput.files && fileInput.files[0]) {
        setAdminLoading(true);
        setAdminStatus('جاري رفع الصورة...', 'info');
        imageUrl = await uploadProductImage(fileInput.files[0], nextId);
    }

    const productData = normalizeProduct({
        id: nextId,
        name: document.getElementById('productName').value.trim(),
        brand: document.getElementById('productBrand').value.trim(),
        category: document.getElementById('productCategory').value.trim(),
        sizes: sizes,
        discount: parseInt(document.getElementById('productDiscount').value || '0', 10) || 0,
        image: imageUrl,
        status: document.getElementById('productStatus').value
    });

    setAdminLoading(true);
    await db.collection('products').doc(String(productData.id)).set(productData, { merge: false });
    setAdminLoading(false);
    closeModal('productModal');
    setAdminStatus('تم حفظ المنتج بنجاح.', 'success');
}

async function deleteProduct(id) {
    if (!confirm('هل أنتِ متأكدة من حذف هذا المنتج؟')) return;
    setAdminLoading(true);
    await db.collection('products').doc(String(id)).delete();
    setAdminLoading(false);
    setAdminStatus('تم حذف المنتج.', 'success');
}

function renderDiscountValueOptions() {
    const type = document.getElementById('discountType');
    const container = document.getElementById('discountValueCheckboxes');
    if (!type || !container) return;
    const mode = type.value;
    var values = [];
    if (mode === 'brand') {
        values = Array.from(new Set(products.map(function (product) { return product.brand; })));
    } else if (mode === 'category') {
        values = Array.from(new Set(products.map(function (product) { return product.category; })));
    }
    container.innerHTML = values.map(function (value) {
        return '<label class="checkbox-item"><input type="checkbox" value="' + value + '"><span>' + value + '</span></label>';
    }).join('');
}

function toggleDiscountValueField() {
    const type = document.getElementById('discountType').value;
    document.getElementById('discountValueGroup').style.display = (type === 'brand' || type === 'category') ? 'block' : 'none';
    document.getElementById('discountManualGroup').style.display = type === 'manual' ? 'block' : 'none';
    if (type === 'brand' || type === 'category') renderDiscountValueOptions();
}

function renderDiscountsTable() {
    const tbody = document.getElementById('discountsTableBody');
    if (!discounts.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">لا توجد خصومات مضافة.</td></tr>';
        return;
    }
    const typeLabels = { brand: 'ماركة', category: 'فئة', manual: 'يدوي', all: 'جميع المنتجات' };
    var now = new Date().toISOString().slice(0, 10);
    tbody.innerHTML = discounts.map(function (discount) {
        var expired = discount.expiresAt && discount.expiresAt < now;
        var expiryText = discount.expiresAt ? discount.expiresAt : 'بدون تاريخ';
        var rowClass = expired ? ' style="opacity:0.5;"' : '';
        return '<tr' + rowClass + '><td>' + typeLabels[discount.type] + '</td><td>' + (discount.type === 'all' ? 'الكل' : discount.value) + '</td><td>' + discount.percentage + '%</td><td>' + expiryText + (expired ? ' (منتهي)' : '') + '</td><td>' + discount.description + '</td><td class="actions"><button class="btn-edit" onclick="editDiscount(\'' + discount.id + '\')">تعديل</button><button class="btn-delete" onclick="deleteDiscount(\'' + discount.id + '\')">حذف</button></td></tr>';
    }).join('');
}

function openDiscountModal(discount) {
    document.getElementById('discountModalTitle').textContent = discount ? 'تعديل خصم' : 'إضافة خصم';
    document.getElementById('discountId').value = discount ? discount.id : '';
    document.getElementById('discountType').value = discount ? discount.type : 'all';
    toggleDiscountValueField();
    if (discount && (discount.type === 'brand' || discount.type === 'category')) {
        var container = document.getElementById('discountValueCheckboxes');
        var vals = discount.values || [];
        var checkboxes = container.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < checkboxes.length; i++) {
            checkboxes[i].checked = vals.indexOf(checkboxes[i].value) >= 0;
        }
    }
    document.getElementById('discountManualValue').value = discount && discount.type === 'manual' ? discount.value : '';
    document.getElementById('discountPercentage').value = discount ? discount.percentage : '';
    document.getElementById('discountExpiry').value = discount ? (discount.expiresAt || '') : '';
    document.getElementById('discountDescription').value = discount ? discount.description : '';
    document.getElementById('discountModal').style.display = 'flex';
}

function editDiscount(id) {
    const discount = discounts.find(function (entry) { return entry.id === id; });
    if (discount) openDiscountModal(discount);
}

async function saveDiscount(event) {
    event.preventDefault();
    const existingId = document.getElementById('discountId').value;
    const type = document.getElementById('discountType').value;
    var values = [];
    if (type === 'brand' || type === 'category') {
        var container = document.getElementById('discountValueCheckboxes');
        var checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        for (var i = 0; i < checkboxes.length; i++) {
            values.push(checkboxes[i].value);
        }
    } else if (type === 'manual') {
        var manualVal = document.getElementById('discountManualValue').value.trim();
        if (manualVal) values = [manualVal];
    }
    // For "all" type, values stays empty (applies to everything)
    const discountData = normalizeDiscount({
        id: existingId || String(Date.now()),
        type: type,
        values: values,
        value: values.join(', '),
        percentage: parseInt(document.getElementById('discountPercentage').value || '0', 10),
        description: document.getElementById('discountDescription').value.trim(),
        expiresAt: document.getElementById('discountExpiry').value || ''
    });

    setAdminLoading(true);
    await db.collection('discounts').doc(String(discountData.id)).set(discountData, { merge: false });
    setAdminLoading(false);
    closeModal('discountModal');
    setAdminStatus('تم حفظ الخصم.', 'success');
}

async function deleteDiscount(id) {
    if (!confirm('حذف هذا الخصم؟')) return;
    setAdminLoading(true);
    await db.collection('discounts').doc(String(id)).delete();
    setAdminLoading(false);
    setAdminStatus('تم حذف الخصم.', 'success');
}

function loadSettingsForm() {
    document.getElementById('settingWhatsappNumber').value = siteSettings.whatsappNumber || '';
    document.getElementById('settingHero').value = siteSettings.heroSubtitle || '';
    document.getElementById('settingAbout').value = siteSettings.aboutText || '';
    document.getElementById('settingInstagram').value = siteSettings.instagramLink || '';
}

async function saveSettingsForm(event) {
    event.preventDefault();
    siteSettings = normalizeSettings({
        whatsappNumber: document.getElementById('settingWhatsappNumber').value,
        heroSubtitle: document.getElementById('settingHero').value,
        aboutText: document.getElementById('settingAbout').value,
        instagramLink: document.getElementById('settingInstagram').value
    });
    setAdminLoading(true);
    await db.collection('settings').doc('config').set(siteSettings, { merge: true });
    setAdminLoading(false);
    setAdminStatus('تم حفظ الإعدادات بنجاح.', 'success');
}

function renderOrdersTable() {
    const tbody = document.getElementById('ordersTableBody');
    const search = (document.getElementById('orderSearchInput') ? document.getElementById('orderSearchInput').value : '').trim().toLowerCase();
    const statusFilter = document.getElementById('orderStatusFilter') ? document.getElementById('orderStatusFilter').value : 'all';

    const filteredOrders = orders.filter(function (order) {
        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
        const haystack = (String(order.customerName || '') + ' ' + String(order.customerPhone || '')).toLowerCase();
        return matchesStatus && (!search || haystack.indexOf(search) >= 0);
    }).sort(function (a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    if (!filteredOrders.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">لا توجد طلبات مطابقة.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredOrders.map(function (order) {
        const itemsCount = (order.items || []).reduce(function (sum, item) { return sum + (Number(item.qty) || 0); }, 0);
        const deliveryText = order.delivery === 'pickup' ? 'استلام' : (order.region ? DELIVERY_REGION_LABEL(order.region) : 'توصيل');
        return '<tr class="order-main-row" onclick="toggleOrderDetails(\'' + order.id + '\')"><td>' + order.id + '</td><td>' + formatDateTime(order.date) + '</td><td>' + (order.customerName || '-') + '</td><td>' + (order.customerPhone || '-') + '</td><td>' + itemsCount + '</td><td>' + formatCurrency(order.total) + '</td><td>' + deliveryText + '</td><td><select class="order-status-select" onclick="event.stopPropagation()" onchange="updateOrderStatus(\'' + order.id + '\', this.value)">' + ['new', 'processing', 'completed', 'cancelled'].map(function (status) { return '<option value="' + status + '" ' + (order.status === status ? 'selected' : '') + '>' + ORDER_STATUS_LABEL(status) + '</option>'; }).join('') + '</select></td></tr><tr class="order-details-row" id="details-' + order.id + '" style="display:none;"><td colspan="8">' + renderOrderDetails(order) + '</td></tr>';
    }).join('');
}

function renderOrderDetails(order) {
    const itemsHtml = (order.items || []).map(function (item) {
        return '<div class="order-item-card"><strong>' + item.name + '</strong><div>' + item.brand + ' • ' + item.sizeLabel + '</div><div>الكمية: ' + item.qty + ' • السعر: ' + formatCurrency(item.price) + ' • الإجمالي: ' + formatCurrency(item.lineTotal) + '</div></div>';
    }).join('');

    return '<div class="order-details"><div class="order-items-list">' + itemsHtml + '</div><div class="order-meta"><div><strong>الاسم:</strong> ' + (order.customerName || '-') + '<br><strong>الهاتف:</strong> ' + (order.customerPhone || '-') + '<br><strong>العنوان:</strong> ' + (order.address || '-') + '</div><div><strong>طريقة التوصيل:</strong> ' + (order.delivery === 'pickup' ? 'استلام من المعرض' : 'توصيل') + '<br><strong>المنطقة:</strong> ' + DELIVERY_REGION_LABEL(order.region) + '<br><strong>المجموع الفرعي:</strong> ' + formatCurrency(order.subtotal) + '<br><strong>التوصيل:</strong> ' + formatCurrency(order.deliveryCost || 0) + '<br><strong>الإجمالي:</strong> ' + formatCurrency(order.total) + '</div></div>' + (order.notes ? '<div class="order-item-card"><strong>ملاحظات:</strong><div>' + order.notes + '</div></div>' : '') + '</div>';
}

function toggleOrderDetails(orderId) {
    const row = document.getElementById('details-' + orderId);
    if (!row) return;
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

async function updateOrderStatus(orderId, status) {
    setAdminLoading(true);
    await db.collection('orders').doc(String(orderId)).update({ status: status });
    setAdminLoading(false);
    setAdminStatus('تم تحديث حالة الطلب.', 'success');
}

function ORDER_STATUS_LABEL(status) {
    return { new: 'جديد', processing: 'قيد المعالجة', completed: 'مكتمل', cancelled: 'ملغي' }[status] || status;
}

function DELIVERY_REGION_LABEL(region) {
    return { pickup: 'استلام', westbank: 'الضفة', jerusalem: 'القدس', inside: 'الداخل' }[region] || '-';
}

function renderDashboard() {
    const completedOrders = orders.filter(function (order) { return order.status === 'completed'; });
    const totalRevenue = completedOrders.reduce(function (sum, order) { return sum + (Number(order.total) || 0); }, 0);
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(function (order) { return order.status === 'new' || order.status === 'processing'; }).length;
    const completedCount = completedOrders.length;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - 1);
    const ordersWeek = orders.filter(function (order) { return new Date(order.date) >= weekStart; }).length;
    const ordersMonth = orders.filter(function (order) { return new Date(order.date) >= monthStart; }).length;

    document.getElementById('statsGrid').innerHTML = [
        statCard('إجمالي الإيراد', formatCurrency(totalRevenue), 'من الطلبات المكتملة'),
        statCard('إجمالي الطلبات', totalOrders, 'كل الحالات'),
        statCard('الطلبات المعلقة', pendingOrders, 'جديد + قيد المعالجة'),
        statCard('الطلبات المكتملة', completedCount, 'مكتملة فقط'),
        statCard('طلبات هذا الأسبوع', ordersWeek, 'آخر 7 أيام'),
        statCard('طلبات هذا الشهر', ordersMonth, 'آخر 30 يوم'),
        statCard('عدد المنتجات', products.length, 'في المتجر'),
        statCard('عدد الخصومات', discounts.length, 'الخصومات النشطة')
    ].join('');

    renderRevenueChart();
    renderStatusChart();
    renderRegionChart();
    renderTopProductsChart();
}

function statCard(title, value, subtitle) {
    return '<div class="stat-card"><h4>' + title + '</h4><strong>' + value + '</strong><span>' + subtitle + '</span></div>';
}

function destroyChart(key) {
    if (charts[key]) {
        charts[key].destroy();
        charts[key] = null;
    }
}

function renderRevenueChart() {
    const labels = [];
    const values = [];
    for (let index = 29; index >= 0; index -= 1) {
        const day = new Date();
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - index);
        const nextDay = new Date(day);
        nextDay.setDate(day.getDate() + 1);
        labels.push(day.toLocaleDateString('ar-PS', { month: 'short', day: 'numeric' }));
        values.push(orders.filter(function (order) {
            const orderDate = new Date(order.date);
            return order.status === 'completed' && orderDate >= day && orderDate < nextDay;
        }).reduce(function (sum, order) { return sum + (Number(order.total) || 0); }, 0));
    }

    destroyChart('revenue');
    charts.revenue = new Chart(document.getElementById('revenueChart'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'الإيراد', data: values, borderColor: '#c9a96e', backgroundColor: 'rgba(201,169,110,0.12)', fill: true, tension: 0.35 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderStatusChart() {
    const statuses = ['new', 'processing', 'completed', 'cancelled'];
    destroyChart('status');
    charts.status = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: {
            labels: statuses.map(ORDER_STATUS_LABEL),
            datasets: [{ data: statuses.map(function (status) { return orders.filter(function (order) { return order.status === status; }).length; }), backgroundColor: ['#60a5fa', '#e2c275', '#34d399', '#f87171'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderRegionChart() {
    const regions = ['pickup', 'westbank', 'jerusalem', 'inside'];
    destroyChart('region');
    charts.region = new Chart(document.getElementById('regionChart'), {
        type: 'pie',
        data: {
            labels: regions.map(DELIVERY_REGION_LABEL),
            datasets: [{ data: regions.map(function (region) { return orders.filter(function (order) { return (order.region || 'pickup') === region; }).length; }), backgroundColor: ['#c9a96e', '#e2c275', '#60a5fa', '#8b5cf6'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTopProductsChart() {
    const totals = {};
    orders.forEach(function (order) {
        (order.items || []).forEach(function (item) {
            totals[item.name] = (totals[item.name] || 0) + (Number(item.qty) || 0);
        });
    });
    const topProducts = Object.keys(totals).map(function (name) {
        return { name: name, qty: totals[name] };
    }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);

    destroyChart('topProducts');
    charts.topProducts = new Chart(document.getElementById('topProductsChart'), {
        type: 'bar',
        data: {
            labels: topProducts.map(function (item) { return item.name; }),
            datasets: [{ label: 'الكمية', data: topProducts.map(function (item) { return item.qty; }), backgroundColor: '#c9a96e' }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
    });
}

async function seedData(force) {
    const shouldForce = force || confirm('سيتم تعبئة فايرستور بالمنتجات الافتراضية إذا كان فارغاً. للكتابة فوق البيانات الحالية اختاري موافق.');
    setAdminLoading(true);
    const result = await seedFirestoreData(shouldForce);
    setAdminLoading(false);
    if (result.seeded) setAdminStatus('تم تنفيذ Seed Data بنجاح.', 'success');
    else setAdminStatus('تم تجاهل Seed Data لأن المنتجات موجودة بالفعل.', 'warning');
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// Image upload functions
function previewImage(input) {
    var preview = document.getElementById('imagePreview');
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
            preview.innerHTML = '<img src="' + e.target.result + '">';
        };
        reader.readAsDataURL(input.files[0]);
        // Clear URL input when file is selected
        document.getElementById('productImage').value = '';
    } else {
        preview.innerHTML = '';
    }
}

async function uploadProductImage(file, productId) {
    // Compress and convert to base64 data URL (stored in Firestore directly)
    return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                var maxSize = 400;
                var w = img.width;
                var h = img.height;
                if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
                else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}