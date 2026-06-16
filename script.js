const API_BASE = 'https://velvet-cakes-api.onrender.com/api';

const safeLocalStorage = {
  getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
  setItem(key, value) { try { localStorage.setItem(key, value); } catch {} },
  removeItem(key) { try { localStorage.removeItem(key); } catch {} }
};

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[&<>"']/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    return '&#039;';
  });
}

function getAuthToken() { return safeLocalStorage.getItem('authToken'); }

function getPaymentMethodName(method) {
    var methodMap = {
        'cash': 'Наличными при получении',
        'card': 'Картой при получении',
        'online': 'Онлайн-оплата',
        'Карта при получении': 'Картой при получении',
        'Наличные при получении': 'Наличными при получении'
    };
    return methodMap[method] || method || 'Картой при получении';
}

function getStatusClass(status) {
    var statusMap = {
        'Новый': 'new',
        'В работе': 'work',
        'Готов': 'ready',
        'Доставлен': 'delivered',
        'Ожидает оплаты': 'new'
    };
    return statusMap[status] || 'new';
}

async function apiFetch(url, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    for (var key in options.headers) {
        if (options.headers.hasOwnProperty(key)) {
            headers[key] = options.headers[key];
        }
    }
    var token = getAuthToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    
    try {
        var res = await fetch(API_BASE + url, Object.assign({}, options, { headers: headers }));
        
        if (!res.ok) {
            var errorMessage = '';
            try {
                var errorData = await res.json();
                errorMessage = errorData.message || errorData.error || errorData.title;
            } catch (e) {
                errorMessage = await res.text().catch(function() { return 'Ошибка сервера'; });
            }
            errorMessage = errorMessage.replace(/API \d+: /, '').replace(/^"|"$/g, '').replace(/\\n/g, ' ').trim();
            throw new Error(errorMessage || 'Ошибка ' + res.status);
        }
        var ct = res.headers.get('content-type');
        return ct && ct.includes('application/json') ? res.json() : res;
    } catch (e) {
        if (e.message.includes('fetch') || e.message.includes('Network')) {
            throw new Error('Не удалось подключиться к серверу');
        }
        throw e;
    }
}

async function uploadImage(file) {
    if (!file) return null;
    var allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.indexOf(file.type) === -1) {
        showToast('Неподдерживаемый формат файла', 'warning');
        return null;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('Файл слишком большой. Максимум 5 MB', 'warning');
        return null;
    }
    var fd = new FormData();
    fd.append('file', file);
    try {
        var token = getAuthToken();
        if (!token) {
            showToast('Требуется авторизация', 'warning');
            return null;
        }
        var res = await fetch(API_BASE + '/products/upload-image', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
        });
        if (!res.ok) {
            var errorData = await res.json().catch(function() { return { error: 'Ошибка сервера' }; });
            throw new Error(errorData.error || 'HTTP ' + res.status);
        }
        var d = await res.json();
        showToast('Изображение загружено!', 'success');
        return d.url;
    } catch (e) {
        console.error('Upload error:', e);
        showToast('Ошибка загрузки: ' + e.message, 'error');
        return null;
    }
}

function openModal(el) { if (el) el.classList.add('active'); }
function closeModal(el) { if (el) el.classList.remove('active'); }

var cart = [];
try { var s = safeLocalStorage.getItem('cart'); cart = s ? JSON.parse(s) : []; } catch (e) { cart = []; }

function updateCartUI() {
  var basketItems = document.querySelector('.basket-items');
  var totalEl = document.querySelector('.total-value');
  var emptyEl = document.getElementById('basket-empty');
  var counter = document.getElementById('basket-counter');
  
  if (counter) {
    var count = cart.reduce(function(s, i) { return s + (i.quantity || 0); }, 0);
    counter.textContent = count;
    counter.style.display = count > 0 ? 'flex' : 'none';
  }
  
  if (!basketItems || !totalEl) return;
  
  if (cart.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    basketItems.innerHTML = '';
    totalEl.textContent = '0 ₽';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  
  var html = '', total = 0;
  cart.forEach(function(item, idx) {
    var qty = item.quantity || 1;
    total += (item.price || 0) * qty;
    html += '<div class="basket-item" data-index="' + idx + '">';
    html += '<div class="item-image"><img src="' + escapeHtml(item.img || 'image/image 13.png') + '" loading="lazy"></div>';
    html += '<div class="item-info">';
    html += '<h3 class="item-title">' + escapeHtml(item.name) + '</h3>';
    html += '<p class="item-desc">' + escapeHtml(item.desc) + '</p>';
    html += '<div class="item-controls">';
    html += '<button class="quantity-btn dec">−</button><span class="quantity-value">' + qty + '</span><button class="quantity-btn inc">+</button>';
    html += '<button class="remove-btn">Удалить</button>';
    html += '</div></div><div class="item-price">' + ((item.price || 0) * qty).toFixed(0) + ' ₽</div></div>';
  });
  basketItems.innerHTML = html;
  totalEl.textContent = total.toFixed(0) + ' ₽';
}

function updateAuthUI() {
  var userStr = safeLocalStorage.getItem('user');
  var user = userStr ? JSON.parse(userStr) : null;
  
  var authBtn = document.getElementById('auth-btn');
  if (authBtn) authBtn.textContent = user ? 'Личный кабинет' : 'Войти';
  
  var profileLinkBtn = document.getElementById('profile-link-btn');
  var adminBtn = document.getElementById('admin-panel-btn');
  var ordersBtn = document.getElementById('orders-btn');
  var logoutBtn = document.getElementById('logout-btn');
  var burgerAuthBtn = document.getElementById('auth-btn-in-burger');
  
  if (profileLinkBtn) profileLinkBtn.style.display = user ? 'block' : 'none';
  if (adminBtn) adminBtn.style.display = (user && user.role === 'manager') ? 'block' : 'none';
  if (ordersBtn) ordersBtn.style.display = (user && ['manager', 'pastry_chef'].indexOf(user.role) !== -1) ? 'block' : 'none';
  if (logoutBtn) logoutBtn.style.display = user ? 'block' : 'none';
  if (burgerAuthBtn) burgerAuthBtn.style.display = user ? 'none' : 'block';
}

async function loadCatalog() {
  try {
    var cats = ['cheesecakes', 'cakes', 'other'];
    var data = {};
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      var res = await fetch(API_BASE + '/products?category=' + c);
      data[c] = res.ok ? await res.json() : [];
    }
    safeLocalStorage.setItem('catalogData', JSON.stringify(data));
    var active = document.getElementById('category-select') ? document.getElementById('category-select').value : 'cakes';
    renderCatalog(active);
  } catch(e) {
    var grid = document.getElementById('catalog-grid');
    if (grid) grid.innerHTML = '<p style="text-align:center;color:#888;padding:40px">Не удалось загрузить каталог</p>';
  }
}

async function loadReviews() {
  try {
    var res = await fetch(API_BASE + '/reviews');
    var reviews = await res.json();
    safeLocalStorage.setItem('reviews', JSON.stringify(reviews));
    renderReviews();
  } catch(e) { console.error(e); }
}

async function loadPopularProducts() {
    var container = document.getElementById('popular-products-container');
    var skeleton = document.getElementById('popular-products-skeleton');
    if (!container) return;
    try {
        var response = await fetch(API_BASE + '/products/popular?limit=3');
        var products = await response.json();
        if (skeleton) skeleton.style.display = 'none';
        if (!products || products.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">Популярных товаров пока нет</p>';
            container.style.display = 'block';
            return;
        }
        var user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
        var isUser = user && user.role === 'user';
        var medals = ['🥇', '🥈', '🥉'];
        var labels = ['1', '2', '3'];
        container.innerHTML = products.map(function(product, index) {
            var imgSrc = product.imageBase64 || product.imageUrl || 'image/image 13.png';
            return '<div class="popular-card" data-id="' + product.id + '" data-name="' + escapeHtml(product.name) + '" data-desc="' + escapeHtml(product.description) + '" data-price="' + product.price + '" data-img="' + imgSrc + '" data-weight="' + escapeHtml(product.weight) + '">' +
                (isUser ? '<button class="favorite-btn" data-id="' + product.id + '">🤍</button>' : '') +
                '<img src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(product.name) + '" loading="lazy" onerror="this.onerror=null; this.src=\'image/image 13.png\';">' +
                '<div class="popular-badge"><span>' + medals[index] + '</span> ' + labels[index] + '</div>' +
                '<h3>' + escapeHtml(product.name) + '</h3>' +
                '<p>' + escapeHtml(product.description || 'Нежный десерт, который выбирают чаще всего') + '</p>' +
                '<div class="price">' + product.price + ' ₽</div>' +
                '<button class="btn add-to-cart-popular">В корзину</button>' +
                '</div>';
        }).join('');
        container.style.display = 'grid';
        attachPopularCardListeners(container);
    } catch(e) {
        console.error('Error loading popular products:', e);
        if (skeleton) skeleton.style.display = 'none';
        container.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">Не удалось загрузить популярные товары</p>';
        container.style.display = 'block';
    }
}

function attachPopularCardListeners(container) {
    container.querySelectorAll('.popular-card').forEach(function(card) {
        card.addEventListener('click', function(e) {
            if (e.target.closest('button')) return;
            window.location.href = 'product.html?id=' + card.dataset.id;
        });
    });
    container.querySelectorAll('.add-to-cart-popular').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var card = e.target.closest('.popular-card');
            addToCart({
                id: +card.dataset.id,
                name: card.dataset.name,
                desc: card.dataset.desc,
                price: +card.dataset.price,
                img: card.dataset.img,
                weight: card.dataset.weight
            });
        });
    });
    container.querySelectorAll('.popular-card .favorite-btn').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (btn.classList.contains('active')) {
                showToast('Товар уже в избранном', 'warning');
            } else {
                await addToFavorites(btn.dataset.id, btn);
            }
        });
    });
}

async function loadComponents() {
  try {
    var fRes = await fetch(API_BASE + '/components/fillings');
    var bRes = await fetch(API_BASE + '/components/cakeBases');
    var fillings = await fRes.json();
    var bases = await bRes.json();
    safeLocalStorage.setItem('fillings', JSON.stringify(fillings.map(function(x){return x.name;})));
    safeLocalStorage.setItem('cakeBases', JSON.stringify(bases.map(function(x){return x.name;})));
    updateConstructorSelects();
  } catch(e) { console.error(e); }
}

async function addToFavorites(productId, btnElement) {
  var token = getAuthToken();
  var user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
  if (!token || user.role !== 'user') {
    showToast('Войдите как клиент, чтобы добавить в избранное', 'warning');
    return;
  }
  try {
    var response = await fetch(API_BASE + '/favorites', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(productId)
    });
    if (response.ok) {
      btnElement.classList.add('active');
      btnElement.textContent = '❤️';
      showToast('Добавлено в избранное', 'success');
    } else if (response.status === 400) {
      showToast('Товар уже в избранном', 'warning');
    }
  } catch(e) {
    showToast('Ошибка при добавлении', 'error');
  }
}

function showToast(message, type, title) {
    type = type || 'info';
    title = title || '';
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    var titles = { success: 'Успешно', error: 'Ошибка', warning: 'Внимание', info: 'Уведомление' };
    toast.innerHTML = '<div class="toast-icon">' + (icons[type] || icons.info) + '</div>' +
        '<div class="toast-content">' +
        '<div class="toast-title">' + (title || titles[type]) + '</div>' +
        '<div class="toast-message">' + escapeHtml(message) + '</div>' +
        '</div>' +
        '<button class="toast-close">×</button>' +
        '<div class="toast-progress"></div>';
    container.appendChild(toast);
    toast.style.animation = 'toastSlideIn 0.3s ease forwards';
    var closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', function() { removeToast(toast); });
    setTimeout(function() { removeToast(toast); }, 3000);
}

function removeToast(toast) {
    if (!toast.parentNode) return;
    toast.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(function() {
        if (toast.parentNode) { toast.remove(); }
    }, 300);
}

function renderCatalog(category) {
  var grid = document.getElementById('catalog-grid');
  if (!grid) return;
  try {
    var stored = safeLocalStorage.getItem('catalogData');
    var data = stored ? JSON.parse(stored) : {};
    var items = data[category] || [];
    var user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
    var isMgr = user && user.role === 'manager';
    var isUser = user && user.role === 'user';
    grid.innerHTML = items.map(function(p) {
        var imgSrc = p.imageBase64 || p.imageUrl || 'image/image 13.png';
        return '<div class="cheesecake-card" data-id="' + p.id + '" data-name="' + escapeHtml(p.name) + '" data-desc="' + escapeHtml(p.description) + '" data-price="' + p.price + '" data-img="' + imgSrc + '" data-weight="' + escapeHtml(p.weight) + '">' +
            '<img src="' + escapeHtml(imgSrc) + '" loading="lazy" onerror="this.onerror=null; this.src=\'image/image 13.png\';">' +
            (isUser ? '<button class="favorite-btn" data-id="' + p.id + '">🤍</button>' : '') +
            (isMgr ? '<button class="delete-product-btn" data-id="' + p.id + '">×</button><button class="edit-product-btn" data-id="' + p.id + '">✎</button>' : '') +
            '<h3>' + escapeHtml(p.name) + '</h3>' +
            '<p>' + escapeHtml(p.description) + '</p>' +
            '<div class="price-tag"><span class="weight-badge">' + escapeHtml(p.weight) + '</span><span class="price">' + p.price + ' ₽</span></div>' +
            '<div class="card-actions"><button class="btn add-to-cart">В корзину</button></div>' +
            '</div>';
    }).join('');
    attachCardEventListeners(grid);
  } catch(e) {
    grid.innerHTML = '<p style="text-align:center;color:#888">Ошибка загрузки</p>';
  }
}

function attachCardEventListeners(grid) {
  grid.querySelectorAll('.cheesecake-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      window.location.href = 'product.html?id=' + card.dataset.id;
    });
  });
  grid.querySelectorAll('.add-to-cart').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var card = e.target.closest('.cheesecake-card');
      addToCart({
        id: +card.dataset.id,
        name: card.dataset.name,
        desc: card.dataset.desc,
        price: +card.dataset.price,
        img: card.dataset.img,
        weight: card.dataset.weight
      });
    });
  });
  grid.querySelectorAll('.favorite-btn').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (btn.classList.contains('active')) showToast('Товар уже в избранном', 'warning');
      else await addToFavorites(btn.dataset.id, btn);
    });
  });
  grid.querySelectorAll('.edit-product-btn').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      try {
        var product = await apiFetch('/products/' + btn.dataset.id);
        document.getElementById('edit-product-id').value = product.id;
        document.getElementById('admin-product-name').value = product.name;
        document.getElementById('admin-product-desc').value = product.description || '';
        document.getElementById('admin-product-price').value = product.price;
        document.getElementById('admin-product-weight').value = product.weight || '';
        document.getElementById('admin-product-category').value = product.category || 'cheesecakes';
        document.getElementById('admin-product-img-url').value = product.imageUrl || '';
        if (document.getElementById('selected-image-preview')) {
          document.getElementById('selected-image-preview').style.display = 'none';
        }
        if (document.getElementById('admin-product-img-file')) {
          document.getElementById('admin-product-img-file').value = '';
        }
        var addBtn = document.getElementById('add-product-btn');
        if (addBtn) addBtn.textContent = 'Обновить товар';
        openModal(document.getElementById('admin-modal'));
      } catch(err) {
        showToast('Ошибка загрузки товара: ' + err.message, 'error');
      }
    });
  });
  grid.querySelectorAll('.delete-product-btn').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (confirm('Удалить товар?')) {
        try {
          await apiFetch('/products/' + btn.dataset.id, { method: 'DELETE' });
          loadCatalog();
          showToast('Товар удалён', 'success');
        } catch(err) {
          showToast('Ошибка удаления: ' + err.message, 'error');
        }
      }
    });
  });
}

function renderReviews() {
    var el = document.getElementById('reviews-list');
    if (!el) return;
    var revs = JSON.parse(safeLocalStorage.getItem('reviews') || '[]');
    var user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
    var isMgr = user && user.role === 'manager';
    
    if (!revs || revs.length === 0) {
        el.innerHTML = '<p style="text-align:center;color:#888;">Отзывов пока нет</p>';
        return;
    }
    
    var sortValue = document.getElementById('review-sort') ? document.getElementById('review-sort').value : 'high';
    var sortedRevs = revs.slice().sort(function(a, b) {
        var ratingA = a.rating || 5;
        var ratingB = b.rating || 5;
        if (sortValue === 'high') {
            return ratingB - ratingA;
        } else {
            return ratingA - ratingB;
        }
    });
    
    el.innerHTML = sortedRevs.map(function(r) {
        var starsHtml = '';
        var rating = r.rating || 5;
        for (var i = 1; i <= 5; i++) {
            starsHtml += '<span class="rating-star">' + (i <= rating ? '★' : '☆') + '</span>';
        }
        var productsHtml = '';
        if (r.order && r.order.orderItems && r.order.orderItems.length > 0) {
            productsHtml = '<div class="review-order-items">';
            r.order.orderItems.forEach(function(item) {
                var name = item.product ? item.product.name : (item.customCake ? item.customCake.name : 'Индивидуальный торт');
                var imgSrc = 'image/image 13.png';
                if (item.product && item.product.imageBase64) {
                    imgSrc = item.product.imageBase64;
                } else if (item.product && item.product.imageUrl) {
                    imgSrc = item.product.imageUrl;
                } else if (item.customCake && item.customCake.imageUrl) {
                    imgSrc = item.customCake.imageUrl;
                }
                productsHtml += '<div class="review-order-item">' +
                    '<img src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(name) + '" onerror="this.src=\'image/image 13.png\'">' +
                    '<span>' + escapeHtml(name) + ' × ' + item.quantity + '</span>' +
                    '</div>';
            });
            productsHtml += '</div>';
        }
        return '<div class="review-card" data-id="' + r.id + '">' +
            (isMgr ? '<button class="delete-review-btn" data-id="' + r.id + '">×</button>' : '') +
            '<div class="review-header">' +
            '<div class="review-user-info">' +
            '<h4>' + escapeHtml(r.authorName || 'Аноним') + '</h4>' +
            '<div class="review-rating-stars">' + starsHtml + '</div>' +
            '</div>' +
            '</div>' +
            productsHtml +
            '<p class="review-text">' + escapeHtml(r.text) + '</p>' +
            '<div class="review-footer">' +
            '<span class="review-date">' + new Date(r.createdAt).toLocaleDateString() + '</span>' +
            (r.order ? '<span class="review-order-link">Заказ #' + r.order.id + '</span>' : '') +
            '</div>' +
            '</div>';
    }).join('');
    
    document.querySelectorAll('.delete-review-btn').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (confirm('Удалить отзыв?')) {
                try {
                    await apiFetch('/reviews/' + btn.dataset.id, { method: 'DELETE' });
                    loadReviews();
                    showToast('Отзыв удалён', 'success');
                } catch(err) {
                    showToast('Ошибка удаления: ' + err.message, 'error');
                }
            }
        });
    });
}

var fillingCounter = 1;
var cakeBaseCounter = 1;

var componentPrices = {
    fillings: {
        'Strawberry': 0,
        'Blueberry': 0,
        'Chocolate': 0,
        'Caramel': 0,
        'Raspberry': 0,
        'Pistachio': 0
    },
    cakeBases: {
        'Vanilla sponge': 0,
        'Chocolate sponge': 0,
        'Honey sponge': 0,
        'Coconut sponge': 0
    }
};

async function loadComponentPrices() {
    try {
        var fRes = await fetch(API_BASE + '/components/fillings');
        var bRes = await fetch(API_BASE + '/components/cakeBases');
        var fillings = await fRes.json();
        var bases = await bRes.json();
        fillings.forEach(function(f) { componentPrices.fillings[f.name] = f.basePricePerUnit; });
        bases.forEach(function(b) { componentPrices.cakeBases[b.name] = b.basePricePerUnit; });
        calculateTotalPrice();
    } catch(e) {
        console.error('Error loading component prices:', e);
    }
}

function calculateTotalPrice() {
    var weight = parseFloat(document.getElementById('weight') ? document.getElementById('weight').value : 1) || 1;
    var basePricePerKg = 1300;
    var baseCost = weight * basePricePerKg;
    var cakeBaseCost = 0;
    var allCakeBases = document.querySelectorAll('select[id^="cake-base-"]');
    var selectedCakeBases = [];
    allCakeBases.forEach(function(select) {
        var selectedValue = select.value;
        if (selectedValue && selectedValue !== 'Выберите бисквит...' && selectedValue !== '') {
            selectedCakeBases.push(selectedValue);
        }
    });
    selectedCakeBases.forEach(function(base, index) {
        if (index > 0) {
            var price = componentPrices.cakeBases[base] || 200;
            cakeBaseCost += price;
        }
    });
    var fillingsCost = 0;
    var allFillings = document.querySelectorAll('select[id^="filling-"]');
    var selectedFillings = [];
    allFillings.forEach(function(select) {
        var selectedValue = select.value;
        if (selectedValue && selectedValue !== 'Выберите начинку...' && selectedValue !== '') {
            selectedFillings.push(selectedValue);
        }
    });
    selectedFillings.forEach(function(filling, index) {
        if (index > 0) {
            var price = componentPrices.fillings[filling] || 150;
            fillingsCost += price;
        }
    });
    var total = baseCost + cakeBaseCost + fillingsCost;
    var cakeBaseCostEl = document.getElementById('cake-base-cost');
    var fillingsCostEl = document.getElementById('fillings-cost');
    var totalPriceEl = document.getElementById('total-price');
    if (cakeBaseCostEl) cakeBaseCostEl.textContent = Math.round(cakeBaseCost) + ' ₽';
    if (fillingsCostEl) fillingsCostEl.textContent = Math.round(fillingsCost) + ' ₽';
    if (totalPriceEl) totalPriceEl.innerHTML = Math.round(total) + ' ₽';
    window.constructorState = {
        hasFilling: selectedFillings.length > 0,
        hasCakeBase: selectedCakeBases.length > 0,
        total: total,
        weight: weight
    };
    return total;
}

function validateConstructor() {
    var allFillings = document.querySelectorAll('select[id^="filling-"]');
    var allCakeBases = document.querySelectorAll('select[id^="cake-base-"]');
    var hasValidFilling = false;
    var hasValidCakeBase = false;
    allFillings.forEach(function(select) {
        var value = select.value;
        if (value && value !== 'Выберите начинку...' && value !== '') {
            hasValidFilling = true;
        }
    });
    allCakeBases.forEach(function(select) {
        var value = select.value;
        if (value && value !== 'Выберите бисквит...' && value !== '') {
            hasValidCakeBase = true;
        }
    });
    if (!hasValidFilling) {
        showToast('Пожалуйста, выберите хотя бы одну начинку для торта', 'warning');
        return false;
    }
    if (!hasValidCakeBase) {
        showToast('Пожалуйста, выберите хотя бы один бисквит для торта', 'warning');
        return false;
    }
    return true;
}

function addNewFilling() {
    var container = document.getElementById('filling-container');
    var newId = fillingCounter++;
    var fillings = JSON.parse(safeLocalStorage.getItem('fillings') || '[]');
    var newDiv = document.createElement('div');
    newDiv.className = 'form-group';
    newDiv.id = 'filling-group-' + newId;
    newDiv.innerHTML = '<div class="form-row">' +
        '<select id="filling-' + newId + '" style="flex: 1;" class="filling-select">' +
        '<option value="" disabled selected>Выберите начинку...</option>' +
        fillings.map(function(f) { return '<option value="' + escapeHtml(f) + '">' + escapeHtml(f) + '</option>'; }).join('') +
        '</select>' +
        '<button type="button" class="remove-option-btn" data-id="' + newId + '" style="width: 48px; height: 48px; border-radius: var(--border-radius-sm); background: #ff4757; color: white; border: none; cursor: pointer; font-size: 20px;">✕</button>' +
        '</div>';
    container.appendChild(newDiv);
    newDiv.querySelector('.filling-select').addEventListener('change', calculateTotalPrice);
    newDiv.querySelector('.remove-option-btn').addEventListener('click', function() {
        newDiv.remove();
        calculateTotalPrice();
    });
    calculateTotalPrice();
}

function addNewCakeBase() {
    var container = document.getElementById('cake-base-container');
    var newId = cakeBaseCounter++;
    var cakeBases = JSON.parse(safeLocalStorage.getItem('cakeBases') || '[]');
    var newDiv = document.createElement('div');
    newDiv.className = 'form-group';
    newDiv.id = 'cakebase-group-' + newId;
    newDiv.innerHTML = '<div class="form-row">' +
        '<select id="cake-base-' + newId + '" style="flex: 1;" class="cakebase-select">' +
        '<option value="" disabled selected>Выберите бисквит...</option>' +
        cakeBases.map(function(b) { return '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>'; }).join('') +
        '</select>' +
        '<button type="button" class="remove-option-btn" data-id="' + newId + '" style="width: 48px; height: 48px; border-radius: var(--border-radius-sm); background: #ff4757; color: white; border: none; cursor: pointer; font-size: 20px;">✕</button>' +
        '</div>';
    container.appendChild(newDiv);
    newDiv.querySelector('.cakebase-select').addEventListener('change', calculateTotalPrice);
    newDiv.querySelector('.remove-option-btn').addEventListener('click', function() {
        newDiv.remove();
        calculateTotalPrice();
    });
    calculateTotalPrice();
}

function updateConstructorSelects() {
    var fillings = JSON.parse(safeLocalStorage.getItem('fillings') || '[]');
    var cakeBases = JSON.parse(safeLocalStorage.getItem('cakeBases') || '[]');
    document.querySelectorAll('select[id^="filling-"]').forEach(function(select) {
        var currentVal = select.value;
        select.innerHTML = '<option value="" disabled selected>Выберите начинку...</option>' + 
            fillings.map(function(o) { return '<option value="' + escapeHtml(o) + '" ' + (currentVal === o ? 'selected' : '') + '>' + escapeHtml(o) + '</option>'; }).join('');
        select.removeEventListener('change', calculateTotalPrice);
        select.addEventListener('change', calculateTotalPrice);
    });
    document.querySelectorAll('select[id^="cake-base-"]').forEach(function(select) {
        var currentVal = select.value;
        select.innerHTML = '<option value="" disabled selected>Выберите бисквит...</option>' + 
            cakeBases.map(function(o) { return '<option value="' + escapeHtml(o) + '" ' + (currentVal === o ? 'selected' : '') + '>' + escapeHtml(o) + '</option>'; }).join('');
        select.removeEventListener('change', calculateTotalPrice);
        select.addEventListener('change', calculateTotalPrice);
    });
    calculateTotalPrice();
}

function addToCart(p) {
    var isCustomCake = p.isCustom === true;
    var existingItem;
    if (isCustomCake) {
        existingItem = cart.find(function(item) {
            return item.isCustom === true && JSON.stringify(item.customData) === JSON.stringify(p.customData);
        });
    } else {
        existingItem = cart.find(function(i) { return i.id === p.id; });
    }
    if (existingItem) {
        existingItem.quantity = (existingItem.quantity || 0) + 1;
    } else {
        cart.push(Object.assign({}, p, { quantity: 1, id: p.id || Date.now() }));
    }
    safeLocalStorage.setItem('cart', JSON.stringify(cart));
    updateCartUI();
    showToast(p.isCustom ? 'Индивидуальный торт добавлен в корзину!' : 'Товар добавлен в корзину', 'success');
}

function setupSearch() {
  var searchInput = document.getElementById('search-input');
  if (!searchInput) return;
  var suggestionsContainer = document.getElementById('search-suggestions');
  if (!suggestionsContainer) {
    suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'search-suggestions';
    searchInput.parentNode.style.position = 'relative';
    searchInput.parentNode.appendChild(suggestionsContainer);
  }
  var searchTimeout;
  searchInput.addEventListener('input', function(e) {
    var query = e.target.value.trim();
    clearTimeout(searchTimeout);
    suggestionsContainer.style.display = 'none';
    suggestionsContainer.innerHTML = '';
    if (query.length < 2) return;
    searchTimeout = setTimeout(async function() {
      try {
        var res = await fetch(API_BASE + '/products/search?q=' + encodeURIComponent(query));
        if (!res.ok) throw new Error('Search failed');
        var products = await res.json();
        if (!products.length) return;
        suggestionsContainer.innerHTML = products.map(function(p) {
          var imgSrc = p.imageBase64 || p.imageUrl || 'image/image 13.png';
          return '<div class="search-suggestion" data-id="' + p.id + '">' +
            '<img src="' + escapeHtml(imgSrc) + '" alt="" onerror="this.onerror=null; this.src=\'image/image 13.png\';">' +
            '<div><strong>' + escapeHtml(p.name) + '</strong><div><small>' + p.price + ' ₽</small></div></div>' +
            '</div>';
        }).join('');
        suggestionsContainer.style.display = 'block';
        document.querySelectorAll('.search-suggestion').forEach(function(el) {
          el.addEventListener('click', function() { window.location.href = 'product.html?id=' + el.dataset.id; });
        });
      } catch(e) { console.error('Search error:', e); }
    }, 400);
  });
  document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.style.display = 'none';
    }
  });
}

async function loadNotifications() {
  var token = getAuthToken();
  var badge = document.getElementById('notifications-badge');
  if (!token) { if (badge) badge.style.display = 'none'; return; }
  try {
    var notifications = await apiFetch('/notifications');
    var unreadCount = notifications.filter(function(n) { return !n.isRead; }).length;
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
    var list = document.getElementById('notifications-list');
    if (list) {
      list.innerHTML = notifications.length ? notifications.map(function(n) {
        return '<div class="notification-item" data-id="' + n.id + '" style="padding:12px;border-bottom:1px solid #eee;' + (!n.isRead ? 'background:#f9f0ff;' : '') + '">' +
          '<strong>' + escapeHtml(n.title) + '</strong><p style="margin:5px 0 0;font-size:14px;color:#666;">' + escapeHtml(n.text) + '</p>' +
          '<small>' + new Date(n.sentAt).toLocaleString() + '</small>' +
          '</div>';
      }).join('') : '<p style="text-align:center;padding:20px;">Нет уведомлений</p>';
    }
  } catch(e) { if (badge) badge.style.display = 'none'; }
}

var currentChatId = null;

async function initChat() {
  var token = getAuthToken();
  var user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
  if (!token || user.role === 'pastry_chef') {
    var chatBtn = document.getElementById('chat-button');
    if (chatBtn) chatBtn.style.display = 'none';
    return;
  }
  var chatButton = document.getElementById('chat-button');
  if (chatButton) chatButton.style.display = 'block';
  document.querySelector('.chat-toggle-btn').addEventListener('click', async function() {
    await loadChats();
    openModal(document.getElementById('chat-modal'));
  });
  document.getElementById('send-message-btn').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

async function loadChats() {
  try {
    var token = getAuthToken();
    var user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
    var response = await fetch(API_BASE + '/chat', { headers: { 'Authorization': 'Bearer ' + token } });
    var chats = await response.json();
    if (user.role === 'manager') {
      document.getElementById('chat-sidebar').style.display = 'block';
      var chatsList = document.getElementById('chats-list');
      chatsList.innerHTML = chats.map(function(chat) {
        var unreadCount = chat.messages ? chat.messages.filter(function(m) { return !m.isRead && m.senderRole !== 'manager'; }).length : 0;
        return '<div class="chat-item" data-chat-id="' + chat.id + '">' +
          (chat.user ? chat.user.fullName || chat.user.email || 'Пользователь' : 'Пользователь') +
          (unreadCount > 0 ? '<span style="background:#ff4757;color:white;border-radius:10px;padding:2px 6px;font-size:10px;margin-left:8px;">' + unreadCount + '</span>' : '') +
          '</div>';
      }).join('');
      document.querySelectorAll('.chat-item').forEach(function(el) {
        el.addEventListener('click', function() { selectChat(el.dataset.chatId); });
      });
      if (chats.length > 0 && !currentChatId) selectChat(chats[0].id);
    } else {
      if (chats.length === 0) {
        var createResponse = await fetch(API_BASE + '/chat', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
        var newChat = await createResponse.json();
        currentChatId = newChat.id;
      } else {
        currentChatId = chats[0].id;
      }
      await loadMessages(currentChatId);
      await markMessagesAsRead(currentChatId);
    }
  } catch(e) { console.error('Load chats error:', e); }
}

async function selectChat(chatId) {
  currentChatId = parseInt(chatId);
  document.querySelectorAll('.chat-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.chatId == chatId);
  });
  await loadMessages(currentChatId);
  await markMessagesAsRead(currentChatId);
}

async function loadMessages(chatId) {
  try {
    var token = getAuthToken();
    var response = await fetch(API_BASE + '/chat/' + chatId + '/messages', { headers: { 'Authorization': 'Bearer ' + token } });
    var messages = await response.json();
    var currentUser = JSON.parse(safeLocalStorage.getItem('user') || '{}');
    var currentUserRole = currentUser.role;
    var messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = messages.map(function(msg) {
      var isCurrentUser = (currentUserRole === 'manager' && msg.senderRole === 'manager') || (currentUserRole === 'user' && msg.senderRole === 'user');
      var senderName = isCurrentUser ? 'Вы' : (msg.senderRole === 'manager' ? 'Менеджер' : 'Клиент');
      var messageClass = isCurrentUser ? 'user' : 'manager';
      return '<div class="chat-message ' + messageClass + '"><div class="sender">' + senderName + '</div><div>' + escapeHtml(msg.message) + '</div><div class="time">' + new Date(msg.sentAt).toLocaleTimeString() + '</div></div>';
    }).join('');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    var unreadCount = messages.filter(function(m) {
      return !m.isRead && ((currentUserRole === 'manager' && m.senderRole === 'user') || (currentUserRole === 'user' && m.senderRole === 'manager'));
    }).length;
    var badge = document.querySelector('.chat-unread-badge');
    if (unreadCount > 0) { badge.textContent = unreadCount; badge.style.display = 'flex'; }
    else badge.style.display = 'none';
  } catch(e) { console.error('Load messages error:', e); }
}

async function sendMessage() {
  var input = document.getElementById('chat-input');
  var message = input.value.trim();
  if (!message || !currentChatId) return;
  try {
    var token = getAuthToken();
    var response = await fetch(API_BASE + '/chat/' + currentChatId + '/messages', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message })
    });
    if (response.ok) {
      input.value = '';
      await loadMessages(currentChatId);
      await markMessagesAsRead(currentChatId);
    }
  } catch(e) { console.error('Send message error:', e); }
}

async function markMessagesAsRead(chatId) {
  try {
    var token = getAuthToken();
    await fetch(API_BASE + '/chat/' + chatId + '/read', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + token } });
  } catch(e) { console.error('Mark read error:', e); }
}

var currentCartTotal = 0;

function setupCheckout() {
    var deliveryType = document.getElementById('delivery-type');
    var addressGroup = document.getElementById('address-group');
    var paymentMethod = document.getElementById('payment-method');
    if (deliveryType) {
        deliveryType.addEventListener('change', function() {
            if (addressGroup) {
                addressGroup.style.display = deliveryType.value === 'delivery' ? 'block' : 'none';
            }
            if (paymentMethod) {
                if (deliveryType.value === 'delivery') {
                    paymentMethod.value = 'online';
                    paymentMethod.disabled = true;
                    Array.from(paymentMethod.options).forEach(function(opt) {
                        if (opt.value === 'cash') {
                            opt.style.display = 'none';
                        } else {
                            opt.style.display = 'block';
                        }
                    });
                } else {
                    paymentMethod.disabled = false;
                    Array.from(paymentMethod.options).forEach(function(opt) {
                        opt.style.display = 'block';
                    });
                }
            }
            updateCheckoutTotal();
        });
    }
    var form = document.getElementById('checkout-form');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            await processOrder();
        });
    }
    var dateInput = document.getElementById('checkout-delivery-date');
    if (dateInput) {
        var tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.min = tomorrow.toISOString().split('T')[0];
        dateInput.value = tomorrow.toISOString().split('T')[0];
    }
}

function updateCheckoutTotal() {
    var deliveryType = document.getElementById('delivery-type');
    if (!deliveryType) return;
    var subtotal = currentCartTotal;
    var total = deliveryType.value === 'pickup' ? subtotal * 0.85 : subtotal;
    var subtotalEl = document.getElementById('checkout-subtotal');
    var deliveryFeeItem = document.getElementById('delivery-fee-item');
    var totalEl = document.getElementById('checkout-total');
    if (subtotalEl) subtotalEl.textContent = Math.round(subtotal) + ' ₽';
    if (deliveryFeeItem) deliveryFeeItem.style.display = 'none';
    if (totalEl) totalEl.textContent = Math.round(total) + ' ₽';
}

async function processOrder() {
    var user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
    if (!user || user.role !== 'user') {
        showToast('Войдите как клиент', 'warning');
        return;
    }
    var deliveryType = document.getElementById('delivery-type').value;
    var paymentMethod = document.getElementById('payment-method').value;
    var deliveryDate = document.getElementById('checkout-delivery-date').value;
    var comments = document.getElementById('order-comments').value;
    var deliveryAddress = '';
    if (deliveryType === 'delivery') {
        deliveryAddress = document.getElementById('delivery-address').value.trim();
        if (!deliveryAddress) {
            showToast('Укажите адрес доставки', 'warning');
            return;
        }
    }
    if (!deliveryDate) {
        showToast('Укажите дату', 'warning');
        return;
    }
    var total = currentCartTotal;
    if (deliveryType === 'pickup') total = total * 0.85;
    var orderData = {
        total: Math.round(total),
        deliveryAddress: deliveryAddress || 'Самовывоз',
        comments: comments,
        deliveryDate: deliveryDate,
        paymentMethod: paymentMethod,
        items: cart.map(function(i) {
            return {
                productId: (i.id && i.id <= 9000000 && !i.isCustom) ? i.id : null,
                isCustom: i.isCustom || false,
                name: i.name,
                description: i.desc,
                weight: parseFloat(i.weight) || 1,
                price: i.price,
                quantity: i.quantity || 1,
                customData: i.customData || null
            };
        })
    };
    try {
        var response = await apiFetch('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        var orderId = null;
        if (paymentMethod === 'online') {
            if (response && response.id) {
                orderId = response.id;
            } else if (response && response.order && response.order.id) {
                orderId = response.order.id;
            } else {
                orderId = response.id || (response.order ? response.order.id : null);
            }
            if (!orderId) {
                console.error('Cannot get order ID from response:', response);
                showToast('Ошибка: не удалось получить ID заказа', 'error');
                return;
            }
            safeLocalStorage.setItem('pendingOrderData', JSON.stringify(orderData));
            safeLocalStorage.setItem('pendingCart', JSON.stringify(cart));
            safeLocalStorage.setItem('pendingOrderId', orderId);
            cart = [];
            safeLocalStorage.setItem('cart', '[]');
            updateCartUI();
            closeModal(document.getElementById('checkout-modal'));
            closeModal(document.getElementById('basket-modal'));
            showToast('Заказ создан! Перенаправление на оплату...', 'success');
            window.location.href = 'payment.html?orderId=' + orderId;
        } else {
            cart = [];
            safeLocalStorage.setItem('cart', '[]');
            updateCartUI();
            closeModal(document.getElementById('checkout-modal'));
            closeModal(document.getElementById('basket-modal'));
            showToast('Заказ успешно оформлен!', 'success');
        }
    } catch(e) {
        showToast('Ошибка: ' + e.message, 'error');
    }
}

function setupCatalogToggle() {
    var grid = document.getElementById('catalog-grid');
    if (!grid) return;
    var wrapper = grid.parentElement;
    if (!wrapper.classList.contains('catalog-grid-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'catalog-grid-wrapper';
        wrapper.style.cssText = 'transition: max-height 0.3s ease-out; overflow: hidden; max-height: none;';
        grid.parentNode.insertBefore(wrapper, grid);
        wrapper.appendChild(grid);
    }
    function updateToggleButton() {
        var items = grid.querySelectorAll('.cheesecake-card');
        var needToggle = items.length > 3;
        var toggleContainer = document.querySelector('.catalog-toggle-container');
        if (needToggle) {
            if (!toggleContainer) {
                toggleContainer = document.createElement('div');
                toggleContainer.className = 'catalog-toggle-container';
                var toggleBtn = document.createElement('button');
                toggleBtn.className = 'catalog-toggle-btn';
                toggleBtn.innerHTML = '<span class="toggle-text">Показать все</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                toggleContainer.appendChild(toggleBtn);
                wrapper.parentNode.insertBefore(toggleContainer, wrapper.nextSibling);
                var isExpanded = false;
                setTimeout(function() {
                    var firstRow = items[0];
                    var secondRow = items[3];
                    if (firstRow && secondRow) {
                        var rowHeight = secondRow.offsetTop - firstRow.offsetTop;
                        wrapper.style.maxHeight = (rowHeight + 10) + 'px';
                    } else if (firstRow) {
                        wrapper.style.maxHeight = (firstRow.offsetHeight + 20) + 'px';
                    }
                    isExpanded = false;
                    toggleBtn.querySelector('.toggle-text').textContent = 'Показать все';
                    toggleBtn.querySelector('svg').style.transform = 'rotate(0deg)';
                }, 100);
                toggleBtn.addEventListener('click', function() {
                    if (isExpanded) {
                        var firstRow = items[0];
                        var secondRow = items[3];
                        if (firstRow && secondRow) {
                            var rowHeight = secondRow.offsetTop - firstRow.offsetTop;
                            wrapper.style.maxHeight = (rowHeight + 10) + 'px';
                        } else if (firstRow) {
                            wrapper.style.maxHeight = (firstRow.offsetHeight + 20) + 'px';
                        }
                        this.querySelector('.toggle-text').textContent = 'Показать все';
                        this.querySelector('svg').style.transform = 'rotate(0deg)';
                    } else {
                        wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
                        this.querySelector('.toggle-text').textContent = 'Свернуть';
                        this.querySelector('svg').style.transform = 'rotate(180deg)';
                    }
                    isExpanded = !isExpanded;
                });
            }
        } else {
            if (toggleContainer) {
                toggleContainer.remove();
            }
            wrapper.style.maxHeight = 'none';
        }
    }
    var observer = new MutationObserver(function() {
        setTimeout(updateToggleButton, 100);
    });
    observer.observe(grid, { childList: true, subtree: true });
    setTimeout(updateToggleButton, 100);
}

async function loadComponentsAdmin() {
  var token = getAuthToken();
  if (!token) return;
  try {
    var fillingsRes = await fetch(API_BASE + '/components/fillings', { headers: { 'Authorization': 'Bearer ' + token } });
    var fillings = await fillingsRes.json();
    var fillingsList = document.getElementById('fillings-list');
    if (fillingsList) {
      fillingsList.innerHTML = fillings.map(function(f) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;">' +
          '<span>🍯 ' + escapeHtml(f.name) + '</span>' +
          '<button class="delete-component-btn" data-id="' + f.id + '" data-type="filling" style="background:#ff4757;color:white;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;">×</button>' +
          '</div>';
      }).join('');
    }
    var basesRes = await fetch(API_BASE + '/components/cakeBases', { headers: { 'Authorization': 'Bearer ' + token } });
    var bases = await basesRes.json();
    var basesList = document.getElementById('cake-bases-list');
    if (basesList) {
      basesList.innerHTML = bases.map(function(b) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;">' +
          '<span>🍰 ' + escapeHtml(b.name) + '</span>' +
          '<button class="delete-component-btn" data-id="' + b.id + '" data-type="cakeBase" style="background:#ff4757;color:white;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;">×</button>' +
          '</div>';
      }).join('');
    }
    document.querySelectorAll('.delete-component-btn').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var componentId = btn.dataset.id;
        var componentType = btn.dataset.type === 'filling' ? 'начинку' : 'бисквит';
        if (confirm('Удалить ' + componentType + '?')) {
          try {
            var response = await fetch(API_BASE + '/components/' + componentId, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } });
            if (!response.ok) throw new Error((await response.json()).message || 'Ошибка удаления');
            showToast(componentType + ' удалена!', 'success');
            loadComponentsAdmin();
            loadComponents();
          } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
        }
      });
    });
  } catch(e) { console.error('Load components admin error:', e); }
}

async function loadPendingReviews() {
    var token = getAuthToken();
    if (!token) return;
    try {
        var response = await fetch(API_BASE + '/reviews/pending', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!response.ok) throw new Error('Ошибка загрузки');
        var reviews = await response.json();
        var container = document.getElementById('pending-reviews-list');
        if (!container) {
            console.log('Контейнер pending-reviews-list не найден');
            return;
        }
        if (reviews.length === 0) {
            container.innerHTML = '<p style="padding: 20px; text-align: center; color: #888;">Нет отзывов на модерации</p>';
            return;
        }
        container.innerHTML = reviews.map(function(r) {
            var starsHtml = '';
            var rating = r.rating || 5;
            for (var i = 1; i <= 5; i++) {
                starsHtml += '<span class="rating-star">' + (i <= rating ? '★' : '☆') + '</span>';
            }
            return '<div class="pending-review" data-id="' + r.id + '" style="border: 1px solid #eee; padding: 15px; margin-bottom: 10px; border-radius: 12px; background: #fff;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">' +
                '<div>' +
                '<strong>👤 ' + escapeHtml(r.authorName || 'Аноним') + '</strong>' +
                '<div style="margin-top: 4px;">' + starsHtml + '</div>' +
                '</div>' +
                '<small style="color: #888;">' + new Date(r.createdAt).toLocaleDateString() + '</small>' +
                '</div>' +
                '<p style="margin: 10px 0; word-wrap: break-word;">' + escapeHtml(r.text) + '</p>' +
                '<div style="display: flex; gap: 10px; margin-top: 10px;">' +
                '<button class="approve-review-btn btn" data-id="' + r.id + '" style="background: #4caf50; padding: 6px 16px; font-size: 14px;">Одобрить</button>' +
                '<button class="reject-review-btn btn" data-id="' + r.id + '" style="background: #ff4757; padding: 6px 16px; font-size: 14px;">Отклонить</button>' +
                '</div>' +
                '</div>';
        }).join('');
        document.querySelectorAll('.approve-review-btn').forEach(function(btn) {
            btn.addEventListener('click', async function(e) {
                e.stopPropagation();
                var reviewId = btn.dataset.id;
                if (confirm('Одобрить этот отзыв? Он сразу появится на сайте.')) {
                    try {
                        var approveResponse = await fetch(API_BASE + '/reviews/' + reviewId + '/approve', {
                            method: 'PUT',
                            headers: { 'Authorization': 'Bearer ' + token }
                        });
                        if (approveResponse.ok) {
                            showToast('Отзыв одобрен и опубликован!', 'success');
                            loadPendingReviews();
                            loadReviews();
                        } else {
                            showToast('Ошибка при одобрении отзыва', 'error');
                        }
                    } catch(e) {
                        showToast('Ошибка: ' + e.message, 'error');
                    }
                }
            });
        });
        document.querySelectorAll('.reject-review-btn').forEach(function(btn) {
            btn.addEventListener('click', async function(e) {
                e.stopPropagation();
                var reviewId = btn.dataset.id;
                if (confirm('Отклонить этот отзыв? Он будет удалён без публикации.')) {
                    try {
                        var deleteResponse = await fetch(API_BASE + '/reviews/' + reviewId, {
                            method: 'DELETE',
                            headers: { 'Authorization': 'Bearer ' + token }
                        });
                        if (deleteResponse.ok) {
                            showToast('Отзыв отклонён и удалён', 'success');
                            loadPendingReviews();
                        } else {
                            showToast('Ошибка при отклонении отзыва', 'error');
                        }
                    } catch(e) {
                        showToast('Ошибка: ' + e.message, 'error');
                    }
                }
            });
        });
    } catch(e) {
        console.error('Load pending reviews error:', e);
        var container = document.getElementById('pending-reviews-list');
        if (container) {
            container.innerHTML = '<p style="color: #ff4757; padding: 20px;">Ошибка загрузки отзывов на модерацию</p>';
        }
    }
}

async function loadComponentSelect() {
    var token = getAuthToken();
    if (!token) return;
    try {
        var fRes = await fetch(API_BASE + '/components/fillings', { headers: { 'Authorization': 'Bearer ' + token } });
        var bRes = await fetch(API_BASE + '/components/cakeBases', { headers: { 'Authorization': 'Bearer ' + token } });
        var fillings = await fRes.json();
        var bases = await bRes.json();
        var select = document.getElementById('edit-component-select');
        if (!select) return;
        select.innerHTML = '<option value="">Выберите компонент</option>';
        fillings.forEach(function(f) {
            var opt = document.createElement('option');
            opt.value = f.id;
            opt.dataset.type = 'filling';
            opt.dataset.price = f.basePricePerUnit;
            opt.textContent = f.name + ' (' + f.basePricePerUnit + ' ₽)';
            select.appendChild(opt);
        });
        bases.forEach(function(b) {
            var opt = document.createElement('option');
            opt.value = b.id;
            opt.dataset.type = 'cakeBase';
            opt.dataset.price = b.basePricePerUnit;
            opt.textContent = b.name + ' (' + b.basePricePerUnit + ' ₽)';
            select.appendChild(opt);
        });
        select.addEventListener('change', function() {
            var selected = select.options[select.selectedIndex];
            if (selected && selected.value) {
                document.getElementById('edit-component-price').value = selected.dataset.price || 0;
            }
        });
    } catch(e) {
        console.error('Load component select error:', e);
    }
}

async function loadOrdersForReview() {
    var token = getAuthToken();
    if (!token) return;
    var select = document.getElementById('review-order-select');
    if (!select) return;
    try {
        var response = await fetch(API_BASE + '/reviews/my-orders', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!response.ok) throw new Error('Ошибка загрузки заказов');
        var orders = await response.json();
        safeLocalStorage.setItem('userOrders', JSON.stringify(orders));
        select.innerHTML = '<option value="">-- Выберите заказ --</option>';
        if (orders.length === 0) {
            select.innerHTML = '<option value="">Нет завершённых заказов</option>';
            return;
        }
        orders.forEach(function(order) {
            var opt = document.createElement('option');
            opt.value = order.id;
            var itemsNames = [];
            if (order.orderItems) {
                order.orderItems.forEach(function(item) {
                    var name = item.product ? item.product.name : (item.customCake ? item.customCake.name : 'Индивидуальный торт');
                    itemsNames.push(name);
                });
            }
            opt.textContent = 'Заказ #' + order.id + ' — ' + order.totalAmount + ' ₽ (' + itemsNames.join(', ') + ')';
            select.appendChild(opt);
        });
    } catch(e) {
        console.error('Load orders for review error:', e);
    }
}

function initConstructor() {
    document.getElementById('add-filling-btn').addEventListener('click', addNewFilling);
    document.getElementById('add-cake-base-btn').addEventListener('click', addNewCakeBase);
    var weightInput = document.getElementById('weight');
    if (weightInput) {
        weightInput.addEventListener('input', calculateTotalPrice);
        weightInput.addEventListener('change', calculateTotalPrice);
    }
    var deliveryDate = document.getElementById('delivery-date');
    if (deliveryDate) {
        var tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        deliveryDate.min = deliveryDate.value = tomorrow.toISOString().split('T')[0];
    }
    setTimeout(calculateTotalPrice, 100);
}

function initRatingStars() {
    var stars = document.querySelectorAll('#rating-stars .star');
    var ratingInput = document.getElementById('review-rating');
    if (!stars.length || !ratingInput) return;
    stars.forEach(function(star) {
        star.addEventListener('click', function() {
            var value = parseInt(star.dataset.value);
            ratingInput.value = value;
            stars.forEach(function(s, i) {
                if (i < value) {
                    s.textContent = '★';
                    s.classList.add('active');
                } else {
                    s.textContent = '☆';
                    s.classList.remove('active');
                }
            });
        });
        star.addEventListener('mouseenter', function() {
            var value = parseInt(star.dataset.value);
            stars.forEach(function(s, i) {
                if (i < value) {
                    s.textContent = '★';
                    s.classList.add('hover');
                } else {
                    s.textContent = '☆';
                }
            });
        });
    });
    document.querySelector('#rating-stars').addEventListener('mouseleave', function() {
        var currentRating = parseInt(ratingInput.value);
        stars.forEach(function(s, i) {
            if (i < currentRating) {
                s.textContent = '★';
            } else {
                s.textContent = '☆';
            }
            s.classList.remove('hover');
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
  var burgerDropdown = document.querySelector('.burger-dropdown');
  if (burgerDropdown && !document.getElementById('auth-btn-in-burger')) {
    var authInBurger = document.createElement('button');
    authInBurger.id = 'auth-btn-in-burger';
    authInBurger.textContent = 'Войти';
    authInBurger.style.display = 'none';
    burgerDropdown.insertBefore(authInBurger, burgerDropdown.firstChild);
  }
  updateAuthUI();
  updateCartUI();
  loadCatalog();
  loadPopularProducts();
  loadReviews();
  loadComponents();
  loadNotifications();
  setupSearch();
  initChat();
  setupCheckout();
  setupCatalogToggle();
  initConstructor();
  initRatingStars();
  loadOrdersForReview();
  loadComponentPrices();
  var categorySelect = document.getElementById('category-select');
  if (categorySelect) categorySelect.addEventListener('change', function(e) { renderCatalog(e.target.value); });
  var notifBtn = document.getElementById('notifications-btn');
  var notifModal = document.getElementById('notifications-modal');
  if (notifBtn && notifModal) notifBtn.addEventListener('click', async function() { await loadNotifications(); openModal(notifModal); document.body.style.overflow = 'hidden'; });
  var clearNotifBtn = document.getElementById('clear-notifications-btn');
  if (clearNotifBtn) clearNotifBtn.addEventListener('click', async function() { await apiFetch('/notifications/clear', { method: 'DELETE' }); await loadNotifications(); });
  var openBasket = document.getElementById('open-basket');
  var basketModal = document.getElementById('basket-modal');
  if (openBasket && basketModal) openBasket.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); updateCartUI(); openModal(basketModal); document.body.style.overflow = 'hidden'; });
  document.querySelectorAll('#basket-modal .modal-close, #basket-modal .modal-overlay').forEach(function(el) {
    el.addEventListener('click', function(e) { if (e.target === el || el.classList.contains('modal-close')) { closeModal(basketModal); document.body.style.overflow = ''; } });
  });
  document.querySelector('.basket-items').addEventListener('click', function(e) {
    var item = e.target.closest('.basket-item');
    if (!item) return;
    var idx = +item.dataset.index;
    if (e.target.classList.contains('dec')) {
      if (cart[idx].quantity > 1) cart[idx].quantity--;
      else cart.splice(idx, 1);
    } else if (e.target.classList.contains('inc')) {
      cart[idx].quantity = (cart[idx].quantity || 0) + 1;
    } else if (e.target.classList.contains('remove-btn')) {
      if (confirm('Удалить?')) cart.splice(idx, 1);
    } else return;
    safeLocalStorage.setItem('cart', JSON.stringify(cart));
    updateCartUI();
  });
  document.getElementById('checkout-btn').addEventListener('click', function() {
    if (!cart.length) { showToast('Корзина пуста', 'warning'); return; }
    currentCartTotal = cart.reduce(function(s, i) { return s + (i.price || 0) * (i.quantity || 1); }, 0);
    updateCheckoutTotal();
    openModal(document.getElementById('checkout-modal'));
  });
  var authModal = document.getElementById('auth-modal');
  var loginTab = document.querySelector('.auth-tab[data-tab="login"]');
  var registerTab = document.querySelector('.auth-tab[data-tab="register"]');
  var loginForm = document.getElementById('login-form');
  var registerForm = document.getElementById('register-form');
  if (loginTab && registerTab) {
    loginTab.addEventListener('click', function() { loginTab.classList.add('active'); registerTab.classList.remove('active'); loginForm.classList.add('active'); registerForm.classList.remove('active'); });
    registerTab.addEventListener('click', function() { registerTab.classList.add('active'); loginTab.classList.remove('active'); registerForm.classList.add('active'); loginForm.classList.remove('active'); });
  }
  document.getElementById('auth-btn').addEventListener('click', function() {
    var u = JSON.parse(safeLocalStorage.getItem('user') || '{}');
    if (u.FullName || u.name) window.location.href = 'profile.html';
    else openModal(authModal);
  });
  var burgerAuthBtn = document.getElementById('auth-btn-in-burger');
  if (burgerAuthBtn) burgerAuthBtn.addEventListener('click', function() { openModal(authModal); });
  document.getElementById('profile-link-btn').addEventListener('click', function() { window.location.href = 'profile.html'; });
  document.getElementById('admin-panel-btn').addEventListener('click', function() {
    loadComponentsAdmin();
    loadPendingReviews();
    loadComponentSelect();
    openModal(document.getElementById('admin-modal'));

    var reviewSort = document.getElementById('review-sort');
if (reviewSort) {
    reviewSort.addEventListener('change', function() {
        renderReviews();
    });
}
  });
document.getElementById('orders-btn').addEventListener('click', async function() {
    var modal = document.getElementById('orders-modal');
    var ordersList = document.getElementById('orders-list');
    if (ordersList) {
        try {
            var orders = await apiFetch('/orders');
            if (!orders || orders.length === 0) {
                ordersList.innerHTML = '<p style="text-align: center; padding: 40px; color: #888;">Заказов пока нет</p>';
            } else {
                // СОРТИРОВКА ПО ДАТЕ ПОЛУЧЕНИЯ (от новых к старым)
                orders.sort(function(a, b) {
                    return new Date(b.desiredDeliveryDate) - new Date(a.desiredDeliveryDate);
                });
                ordersList.innerHTML = orders.map(function(order) {
                    var itemsHtml = '';
                    if (order.orderItems && order.orderItems.length > 0) {
                        itemsHtml = '<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #eee;"><strong>Состав заказа:</strong><ul style="margin-top: 8px; margin-left: 20px;">';
                        order.orderItems.forEach(function(item) {
                            var itemName = item.product ? item.product.name : (item.customCake ? item.customCake.name : 'Индивидуальный торт');
                            itemsHtml += '<li>' + escapeHtml(itemName) + ' × ' + item.quantity + ' — ' + item.unitPrice + ' ₽</li>';
                        });
                        itemsHtml += '</ul></div>';
                    } else {
                        itemsHtml = '<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #eee; color: #888;">Состав заказа не указан</div>';
                    }
                    return '<div class="card" style="margin-bottom: 16px; padding: 16px; border: 1px solid #eee; border-radius: 12px;">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">' +
                        '<strong style="font-size: 16px;">Заказ #' + order.id + '</strong>' +
                        '<span class="order-status status-' + getStatusClass(order.status) + '" style="padding: 4px 12px; border-radius: 20px; font-size: 12px;">' + order.status + '</span>' +
                        '</div>' +
                        '<div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">' +
                        '<span><strong>Сумма:</strong> ' + order.totalAmount + ' ₽</span>' +
                        '<span><strong>Дата получения:</strong> ' + order.desiredDeliveryDate + '</span>' +
                        '</div>' +
                        '<div><strong>Способ оплаты:</strong> ' + getPaymentMethodName(order.paymentMethod) + '</div>' +
                        (order.deliveryAddress && order.deliveryAddress !== 'Самовывоз' ? '<div><strong>Адрес доставки:</strong> ' + escapeHtml(order.deliveryAddress) + '</div>' : '<div><strong>Самовывоз</strong></div>') +
                        (order.comments ? '<div><strong>Комментарий:</strong> ' + escapeHtml(order.comments) + '</div>' : '') +
                        itemsHtml +
                        '<select data-order="' + order.id + '" class="order-status-select" style="margin-top: 12px; padding: 6px 12px; border-radius: 8px; border: 1px solid #ddd; width: 100%; max-width: 200px;">' +
                        '<option value="Новый" ' + (order.status === 'Новый' ? 'selected' : '') + '>Новый</option>' +
                        '<option value="В работе" ' + (order.status === 'В работе' ? 'selected' : '') + '>В работе</option>' +
                        '<option value="Готов" ' + (order.status === 'Готов' ? 'selected' : '') + '>Готов</option>' +
                        '<option value="Доставлен" ' + (order.status === 'Доставлен' ? 'selected' : '') + '>Доставлен</option>' +
                        '</select>' +
                        '</div>';
                }).join('');
            }
            document.querySelectorAll('.order-status-select').forEach(function(sel) {
                sel.addEventListener('change', async function(e) {
                    try {
                        await apiFetch('/orders/' + sel.dataset.order + '/status', {
                            method: 'PUT',
                            body: JSON.stringify({ status: e.target.value })
                        });
                        showToast('Статус заказа обновлён', 'success');
                        document.getElementById('orders-btn').click();
                    } catch(err) {
                        showToast('Ошибка обновления статуса: ' + err.message, 'error');
                    }
                });
            });
        } catch(e) {
            console.error('Orders load error:', e);
            ordersList.innerHTML = '<p style="text-align: center; padding: 40px; color: #ff4757;">Ошибка загрузки заказов</p>';
        }
    }
    openModal(modal);
});
  document.getElementById('login-submit').addEventListener('click', async function() {
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    if (!email || !password) {
      showToast('Введите email и пароль', 'warning');
      return;
    }
    try {
      var d = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email, password: password })
      });
      safeLocalStorage.setItem('authToken', d.token);
      safeLocalStorage.setItem('user', JSON.stringify(d.user));
      showToast('Вход выполнен!', 'success');
      closeModal(authModal);
      updateAuthUI();
      loadNotifications();
      window.location.reload();
    } catch(e) {
      var errorMsg = e.message.replace(/API \d+: /, '');
      if (errorMsg.includes('завершена') || errorMsg.includes('подтвердите')) {
        var resendConfirm = confirm('Регистрация не завершена! Отправить письмо с подтверждением повторно?');
        if (resendConfirm) {
          try {
            var resendResponse = await apiFetch('/auth/resend-confirmation', {
              method: 'POST',
              body: JSON.stringify({ email: email })
            });
            if (resendResponse.success) {
              showToast('Письмо с подтверждением отправлено повторно. Проверьте почту.', 'success');
            } else {
              showToast(resendResponse.message || 'Ошибка при отправке письма', 'error');
            }
          } catch(err) {
            showToast('Ошибка при отправке письма: ' + err.message, 'error');
          }
        }
      } else {
        showToast(errorMsg, 'error');
      }
    }
  });
  document.getElementById('register-submit').addEventListener('click', async function() {
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('register-name').value.trim(),
          email: document.getElementById('register-email').value.trim(),
          password: document.getElementById('register-password').value
        })
      });
      showToast('Регистрация успешна! Теперь войдите.', 'success');
      document.querySelector('.auth-tab[data-tab="login"]').click();
      document.getElementById('login-email').value = document.getElementById('register-email').value;
      document.getElementById('login-password').focus();
    } catch(e) {
      var errorMsg = e.message.replace(/API \d+: /, '');
      showToast(errorMsg, 'error');
    }
  });
  document.getElementById('logout-btn').addEventListener('click', function() {
    ['authToken', 'user', 'cart'].forEach(function(k) { safeLocalStorage.removeItem(k); });
    cart = [];
    updateAuthUI();
    updateCartUI();
    showToast('Вы вышли из аккаунта', 'info');
    window.location.reload();
  });
  document.getElementById('submit-review').addEventListener('click', async function() {
    var name = document.getElementById('review-name').value.trim();
    var text = document.getElementById('review-text').value.trim();
    var rating = parseInt(document.getElementById('review-rating') ? document.getElementById('review-rating').value : 5);
    var orderId = document.getElementById('review-order-select') ? document.getElementById('review-order-select').value : null;
    if (!name || !text) {
      showToast('Заполните имя и отзыв', 'warning');
      return;
    }
    try {
      await apiFetch('/reviews', {
        method: 'POST',
        body: JSON.stringify({
          authorName: name,
          text: text,
          rating: rating,
          orderId: orderId ? parseInt(orderId) : null
        })
      });
      document.getElementById('review-name').value = '';
      document.getElementById('review-text').value = '';
      document.getElementById('review-rating').value = 5;
      if (document.getElementById('review-order-select')) document.getElementById('review-order-select').value = '';
      document.querySelectorAll('#rating-stars .star').forEach(function(s, i) {
        if (i < 5) {
          s.textContent = '★';
          s.classList.add('active');
        }
      });
      loadReviews();
      showToast('Отзыв добавлен и отправлен на модерацию', 'success');
    } catch(e) {
      var errorMsg = e.message.replace(/API \d+: /, '');
      showToast(errorMsg, 'error');
    }
  });
  var addProductBtn = document.getElementById('add-product-btn');
  if (addProductBtn) {
    addProductBtn.addEventListener('click', async function() {
      var editId = document.getElementById('edit-product-id').value;
      var fileInput = document.getElementById('admin-product-img-file');
      var imageUrl = document.getElementById('admin-product-img-url').value;
      var name = document.getElementById('admin-product-name').value.trim();
      var description = document.getElementById('admin-product-desc').value.trim();
      var price = parseFloat(document.getElementById('admin-product-price').value);
      var weight = document.getElementById('admin-product-weight').value.trim();
      var category = document.getElementById('admin-product-category').value;
      if (!name) { showToast('Введите название товара', 'warning'); return; }
      if (isNaN(price) || price <= 0) { showToast('Введите корректную цену', 'warning'); return; }
      var hasNewFile = fileInput && fileInput.files && fileInput.files.length > 0;
      if (hasNewFile) {
        var file = fileInput.files[0];
        var allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.indexOf(file.type) === -1) {
          showToast('Неподдерживаемый формат файла', 'warning');
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          showToast('Файл слишком большой. Максимум 5 MB', 'warning');
          return;
        }
        try {
          imageUrl = await uploadImage(file);
          if (!imageUrl) {
            showToast('Не удалось загрузить изображение', 'error');
            return;
          }
        } catch(err) {
          showToast('Ошибка загрузки: ' + err.message, 'error');
          return;
        }
      }
      var product = {
        name: name,
        description: description,
        price: price,
        weight: weight,
        category: category,
        imageUrl: null,
        imageBase64: null
      };
      if (imageUrl) {
        if (imageUrl.startsWith('data:')) {
          product.imageBase64 = imageUrl;
        } else {
          product.imageUrl = imageUrl;
        }
      }
      try {
        if (editId) {
          await apiFetch('/products/' + editId, { method: 'PUT', body: JSON.stringify(product) });
          showToast('Товар обновлён!', 'success');
          document.getElementById('edit-product-id').value = '';
          addProductBtn.textContent = 'Добавить товар';
        } else {
          await apiFetch('/products', { method: 'POST', body: JSON.stringify(product) });
          showToast('Товар добавлен!', 'success');
        }
        document.getElementById('admin-product-name').value = '';
        document.getElementById('admin-product-desc').value = '';
        document.getElementById('admin-product-price').value = '';
        document.getElementById('admin-product-weight').value = '';
        document.getElementById('admin-product-img-file').value = '';
        document.getElementById('admin-product-img-url').value = '';
        if (document.getElementById('selected-image-preview')) {
          document.getElementById('selected-image-preview').style.display = 'none';
        }
        loadCatalog();
        closeModal(document.getElementById('admin-modal'));
      } catch(err) {
        var errorMsg = err.message.replace(/API \d+: /, '');
        showToast('Ошибка сохранения: ' + errorMsg, 'error');
      }
    });
  }
  var selectImageBtn = document.getElementById('select-image-btn');
  var imageFileInput = document.getElementById('admin-product-img-file');
  var imagePreview = document.getElementById('selected-image-preview');
  var previewImg = document.getElementById('preview-img');
  var clearImageBtn = document.getElementById('clear-image-btn');
  if (selectImageBtn && imageFileInput) {
    selectImageBtn.addEventListener('click', function() { imageFileInput.click(); });
    imageFileInput.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (file && previewImg && imagePreview) {
        var reader = new FileReader();
        reader.onload = function(event) { previewImg.src = event.target.result; imagePreview.style.display = 'block'; };
        reader.readAsDataURL(file);
      } else if (imagePreview) { imagePreview.style.display = 'none'; }
    });
    if (clearImageBtn && imagePreview) clearImageBtn.addEventListener('click', function() { imageFileInput.value = ''; imagePreview.style.display = 'none'; if (previewImg) previewImg.src = ''; });
  }
  document.getElementById('admin-add-filling-btn').addEventListener('click', async function() {
    var name = document.getElementById('new-filling-name').value.trim();
    if (!name) { showToast('Введите название', 'warning'); return; }
    try { await apiFetch('/components/fillings', { method: 'POST', body: JSON.stringify({ name: name }) }); showToast('Начинка добавлена', 'success'); document.getElementById('new-filling-name').value = ''; loadComponentsAdmin(); loadComponents(); } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
  });
  document.getElementById('admin-add-cake-base-btn').addEventListener('click', async function() {
    var name = document.getElementById('new-cake-base-name').value.trim();
    if (!name) { showToast('Введите название', 'warning'); return; }
    try { await apiFetch('/components/cakeBases', { method: 'POST', body: JSON.stringify({ name: name }) }); showToast('Бисквит добавлен', 'success'); document.getElementById('new-cake-base-name').value = ''; loadComponentsAdmin(); loadComponents(); } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
  });
  document.getElementById('update-component-btn').addEventListener('click', async function() {
    var select = document.getElementById('edit-component-select');
    var componentId = select.value;
    var price = parseFloat(document.getElementById('edit-component-price').value);
    if (!componentId) {
      showToast('Выберите компонент', 'warning');
      return;
    }
    if (isNaN(price) || price < 0) {
      showToast('Введите корректную цену', 'warning');
      return;
    }
    var token = getAuthToken();
    try {
      var response = await fetch(API_BASE + '/components/' + componentId, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ basePricePerUnit: price, isFirstFree: true })
      });
      if (!response.ok) throw new Error('Ошибка обновления');
      showToast('Компонент обновлён!', 'success');
      loadComponentSelect();
      loadComponents();
      loadComponentPrices();
    } catch(e) {
      showToast('Ошибка: ' + e.message, 'error');
    }
  });
  document.getElementById('add-constructor-to-cart').addEventListener('click', function() {
    if (!validateConstructor()) return;
    var weight = Math.max(0.5, parseFloat(document.getElementById('weight') ? document.getElementById('weight').value : 1) || 1);
    var deliveryDate = document.getElementById('delivery-date') ? document.getElementById('delivery-date').value : null;
    if (!deliveryDate) {
      showToast('Укажите дату получения', 'warning');
      return;
    }
    var selectedFillings = [];
    document.querySelectorAll('select[id^="filling-"]').forEach(function(select) {
      var value = select.value;
      if (value && value !== 'Выберите начинку...' && value !== '') {
        selectedFillings.push(value);
      }
    });
    var selectedCakeBases = [];
    document.querySelectorAll('select[id^="cake-base-"]').forEach(function(select) {
      var value = select.value;
      if (value && value !== 'Выберите бисквит...' && value !== '') {
        selectedCakeBases.push(value);
      }
    });
    var totalPrice = window.constructorState ? window.constructorState.total : calculateTotalPrice();
    var designNotes = document.getElementById('design-notes') ? document.getElementById('design-notes').value : '';
    var description = 'Вес: ' + weight + ' кг | Бисквит: ' + selectedCakeBases.join(', ') + ' | Начинки: ' + selectedFillings.join(', ') + (designNotes ? ' | Пожелания: ' + designNotes.substring(0, 100) : '');
    addToCart({
      id: null,
      name: 'Индивидуальный торт (' + weight + ' кг)',
      desc: description.substring(0, 200),
      price: totalPrice,
      img: 'image/image 13.png',
      weight: weight + ' кг',
      isCustom: true,
      customData: {
        weight: weight,
        fillings: selectedFillings,
        cakeBases: selectedCakeBases,
        designNotes: designNotes,
        deliveryDate: deliveryDate
      }
    });
    openModal(basketModal);
    calculateTotalPrice();
  });
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close')) {
      document.querySelectorAll('.modal-overlay.active').forEach(closeModal);
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.active').forEach(closeModal); document.body.style.overflow = ''; }
  });
  var dd = document.getElementById('delivery-date');
  if (dd) { var t = new Date(); t.setDate(t.getDate() + 1); dd.min = dd.value = t.toISOString().split('T')[0]; }
  if (new URLSearchParams(location.search).get('auth') === 'login') {
    setTimeout(function() { if (authModal) openModal(authModal); }, 150);
  }
});