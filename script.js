const API_BASE = 'https://velvet-cakes-api.onrender.com/api';

window.openPaymentModal = openPaymentModal;
window.closePaymentModal = closePaymentModal;

const safeLocalStorage = {
  getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
  setItem(key, value) { try { localStorage.setItem(key, value); } catch {} },
  removeItem(key) { try { localStorage.removeItem(key); } catch {} }
};

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function getAuthToken() { return safeLocalStorage.getItem('authToken'); }

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  try {
    const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
    
    if (!res.ok) {
      let errorMessage = '';
      try {
        const errorData = await res.json();
        errorMessage = errorData.message || errorData.error || errorData.title;
      } catch {
        errorMessage = await res.text().catch(() => 'Ошибка сервера');
      }
      
      // Очищаем сообщение от технической информации
      errorMessage = errorMessage
        .replace(/API \d+: /, '')
        .replace(/^"|"$/g, '')
        .replace(/\\n/g, ' ')
        .trim();
      
      throw new Error(errorMessage || `Ошибка ${res.status}`);
    }
    
    const ct = res.headers.get('content-type');
    return ct?.includes('application/json') ? res.json() : res;
  } catch (e) {
    if (e.message.includes('fetch') || e.message.includes('Network')) {
      throw new Error('Не удалось подключиться к серверу');
    }
    throw e;
  }
}

async function uploadImage(file) {
    if (!file) return null;
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Неподдерживаемый формат файла', 'warning');
        return null;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('Файл слишком большой. Максимум 5 MB', 'warning');
        return null;
    }
    
    const fd = new FormData();
    fd.append('file', file);
    
    try {
        const token = getAuthToken();
        if (!token) {
            showToast('Требуется авторизация', 'warning');
            return null;
        }
        
        const res = await fetch(`${API_BASE}/products/upload-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: fd
        });
        
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Ошибка сервера' }));
            throw new Error(errorData.error || `HTTP ${res.status}`);
        }
        
        const d = await res.json();
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

let cart = [];
try { const s = safeLocalStorage.getItem('cart'); cart = s ? JSON.parse(s) : []; } catch { cart = []; }

function updateCartUI() {
  const basketItems = document.querySelector('.basket-items');
  const totalEl = document.querySelector('.total-value');
  const emptyEl = document.getElementById('basket-empty');
  const counter = document.getElementById('basket-counter');
  
  if (counter) {
    const count = cart.reduce((s,i) => s + (i.quantity||0), 0);
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
  
  let html = '', total = 0;
  cart.forEach((item, idx) => {
    const qty = item.quantity || 1;
    total += (item.price||0) * qty;
    html += `<div class="basket-item" data-index="${idx}">
      <div class="item-image"><img src="${escapeHtml(item.img||'image/image 13.png')}" loading="lazy"></div>
      <div class="item-info">
        <h3 class="item-title">${escapeHtml(item.name)}</h3>
        <p class="item-desc">${escapeHtml(item.desc)}</p>
        <div class="item-controls">
          <button class="quantity-btn dec">−</button><span class="quantity-value">${qty}</span><button class="quantity-btn inc">+</button>
          <button class="remove-btn">Удалить</button>
        </div>
      </div><div class="item-price">${((item.price||0)*qty).toFixed(0)} ₽</div></div>`;
  });
  basketItems.innerHTML = html;
  totalEl.textContent = `${total.toFixed(0)} ₽`;
}

function updateAuthUI() {
  const userStr = safeLocalStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  
  const authBtn = document.getElementById('auth-btn');
  if (authBtn) authBtn.textContent = user ? 'Личный кабинет' : 'Войти';
  
  const profileLinkBtn = document.getElementById('profile-link-btn');
  const adminBtn = document.getElementById('admin-panel-btn');
  const ordersBtn = document.getElementById('orders-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const burgerAuthBtn = document.getElementById('auth-btn-in-burger');
  
  if (profileLinkBtn) profileLinkBtn.style.display = user ? 'block' : 'none';
  if (adminBtn) adminBtn.style.display = (user?.role === 'manager') ? 'block' : 'none';
  if (ordersBtn) ordersBtn.style.display = (user && ['manager','pastry_chef'].includes(user.role)) ? 'block' : 'none';
  if (logoutBtn) logoutBtn.style.display = user ? 'block' : 'none';
  if (burgerAuthBtn) burgerAuthBtn.style.display = user ? 'none' : 'block';
}

async function loadCatalog() {
  try {
    const cats = ['cheesecakes','cakes','other'];
    const data = {};
    for (const c of cats) {
      const res = await fetch(`${API_BASE}/products?category=${c}`);
      data[c] = res.ok ? await res.json() : [];
    }
    safeLocalStorage.setItem('catalogData', JSON.stringify(data));
    const active = document.getElementById('category-select')?.value || 'cakes';
    renderCatalog(active);
  } catch(e) {
    const grid = document.getElementById('catalog-grid');
    if (grid) grid.innerHTML = '<p style="text-align:center;color:#888;padding:40px">⚠️ Не удалось загрузить каталог</p>';
  }
}

async function loadReviews() {
  try {
    const res = await fetch(`${API_BASE}/reviews`);
    const reviews = await res.json();
    safeLocalStorage.setItem('reviews', JSON.stringify(reviews));
    renderReviews();
  } catch(e) { console.error(e); }
}

// Загрузка популярного товара ("Выбор многих")
async function loadPopularProducts() {
    const container = document.getElementById('popular-product-container');
    const skeleton = document.getElementById('popular-card-skeleton');
    
    if (!container) return;
    
    try {
        const response = await fetch(`${API_BASE}/products/popular?limit=1`);
        const products = await response.json();
        
        if (skeleton) skeleton.style.display = 'none';
        
        if (!products || products.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">Популярных товаров пока нет</p>';
            container.style.display = 'block';
            return;
        }
        
        const product = products[0];
        const user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
        const isUser = user?.role === 'user';
        const imgSrc = product.imageBase64 || product.imageUrl || 'image/image 13.png';
        
        container.innerHTML = `
            <div class="popular-card" data-id="${product.id}" data-name="${escapeHtml(product.name)}" data-desc="${escapeHtml(product.description)}" data-price="${product.price}" data-img="${imgSrc}" data-weight="${escapeHtml(product.weight)}">
                ${isUser ? `<button class="favorite-btn" data-id="${product.id}">🤍</button>` : ''}
                <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.onerror=null; this.src='image/image 13.png';">
                <div class="popular-badge"></div>
                <h3>${escapeHtml(product.name)}</h3>
                <p>${escapeHtml(product.description || 'Нежный десерт, который выбирают чаще всего')}</p>
                <div class="price">${product.price} ₽</div>
                <button class="btn add-to-cart-popular">В корзину</button>
            </div>
        `;
        container.style.display = 'block';
        
        const card = container.querySelector('.popular-card');
        if (card) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                window.location.href = `product.html?id=${card.dataset.id}`;
            });
        }
        
        const addToCartBtn = container.querySelector('.add-to-cart-popular');
        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = e.target.closest('.popular-card');
                addToCart({
                    id: +card.dataset.id,
                    name: card.dataset.name,
                    desc: card.dataset.desc,
                    price: +card.dataset.price,
                    img: card.dataset.img,
                    weight: card.dataset.weight
                });
            });
        }
        
        const favBtn = container.querySelector('.favorite-btn');
        if (favBtn) {
            favBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (favBtn.classList.contains('active')) {
                    showToast('Товар уже в избранном', 'warning');
                } else {
                    await addToFavorites(favBtn.dataset.id, favBtn);
                }
            });
        }
        
    } catch(e) {
        console.error('Error loading popular product:', e);
        if (skeleton) skeleton.style.display = 'none';
        container.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">Не удалось загрузить популярный товар</p>';
        container.style.display = 'block';
    }
}

async function loadComponents() {
  try {
    const [f,b] = await Promise.all([
      fetch(`${API_BASE}/components/fillings`),
      fetch(`${API_BASE}/components/cakeBases`)
    ]);
    const fillings = await f.json(), bases = await b.json();
    safeLocalStorage.setItem('fillings', JSON.stringify(fillings.map(x=>x.name)));
    safeLocalStorage.setItem('cakeBases', JSON.stringify(bases.map(x=>x.name)));
    updateConstructorSelects();
  } catch(e) { console.error(e); }
}

async function addToFavorites(productId, btnElement) {
  const token = getAuthToken();
  const user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
  
  if (!token || user.role !== 'user') {
    showToast('Войдите как клиент, чтобы добавить в избранное', 'warning');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/favorites`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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

// Система тост-уведомлений
function showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const titles = {
        success: 'Успешно',
        error: 'Ошибка',
        warning: 'Внимание',
        info: 'Уведомление'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-title">${title || titles[type]}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close">×</button>
        <div class="toast-progress"></div>
    `;
    
    container.appendChild(toast);
    toast.style.animation = 'toastSlideIn 0.3s ease forwards';
    
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        removeToast(toast);
    });
    
    setTimeout(() => {
        removeToast(toast);
    }, 3000);
}

function removeToast(toast) {
    if (!toast.parentNode) return;
    toast.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 300);
}

function renderCatalog(category) {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;
  try {
    const stored = safeLocalStorage.getItem('catalogData');
    const data = stored ? JSON.parse(stored) : {};
    const items = data[category] || [];
    const user = JSON.parse(safeLocalStorage.getItem('user')||'{}');
    const isMgr = user?.role === 'manager';
    const isUser = user?.role === 'user';
    
    grid.innerHTML = items.map(p => {
        const imgSrc = p.imageBase64 || p.imageUrl || 'image/image 13.png';
        return `
        <div class="cheesecake-card" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-desc="${escapeHtml(p.description)}" data-price="${p.price}" data-img="${imgSrc}" data-weight="${escapeHtml(p.weight)}">
            <img src="${escapeHtml(imgSrc)}" loading="lazy" onerror="this.onerror=null; this.src='image/image 13.png';">
            ${isUser ? `<button class="favorite-btn" data-id="${p.id}">🤍</button>` : ''}
            ${isMgr ? `<button class="delete-product-btn" data-id="${p.id}">×</button><button class="edit-product-btn" data-id="${p.id}">✎</button>` : ''}
            <h3>${escapeHtml(p.name)}</h3>
            <p>${escapeHtml(p.description)}</p>
            <div class="price-tag"><span class="weight-badge">${escapeHtml(p.weight)}</span><span class="price">${p.price} ₽</span></div>
            <div class="card-actions"><button class="btn add-to-cart">В корзину</button></div>
        </div>
        `;
    }).join('');
    
    attachCardEventListeners(grid);
  } catch(e) {
    grid.innerHTML = '<p style="text-align:center;color:#888">Ошибка загрузки</p>';
  }
}

function attachCardEventListeners(grid) {
  grid.querySelectorAll('.cheesecake-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      window.location.href = `product.html?id=${card.dataset.id}`;
    });
  });
  
  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card = e.target.closest('.cheesecake-card');
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
  
  grid.querySelectorAll('.favorite-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.classList.contains('active')) showToast('Товар уже в избранном', 'warning');
      else await addToFavorites(btn.dataset.id, btn);
    });
  });
  
  grid.querySelectorAll('.edit-product-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const product = await apiFetch(`/products/${btn.dataset.id}`);
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
        const addBtn = document.getElementById('add-product-btn');
        if (addBtn) addBtn.textContent = 'Обновить товар';
        openModal(document.getElementById('admin-modal'));
      } catch(err) {
        showToast('Ошибка загрузки товара: ' + err.message, 'error');
      }
    });
  });
  
  grid.querySelectorAll('.delete-product-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Удалить товар?')) {
        try {
          await apiFetch(`/products/${btn.dataset.id}`, { method: 'DELETE' });
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
  const el = document.getElementById('reviews-list');
  if (!el) return;
  const revs = JSON.parse(safeLocalStorage.getItem('reviews')||'[]');
  const user = JSON.parse(safeLocalStorage.getItem('user')||'{}');
  const isMgr = user?.role === 'manager';
  el.innerHTML = revs.map(r => `
    <div class="review-card" data-id="${r.id}">
      ${isMgr ? `<button class="delete-review-btn" data-id="${r.id}">×</button>` : ''}
      <h4>${escapeHtml(r.authorName||'Аноним')}</h4>
      <p style="word-wrap: break-word; white-space: normal; word-break: break-word;">${escapeHtml(r.text)}</p>
    </div>
  `).join('') || '<p style="text-align:center;color:#888">Отзывов пока нет</p>';
  
  document.querySelectorAll('.delete-review-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Удалить отзыв?')) {
        await apiFetch(`/reviews/${btn.dataset.id}`, { method: 'DELETE' });
        loadReviews();
        showToast('Отзыв удалён', 'success');
      }
    });
  });
}

// ========== КОНСТРУКТОР С РАСЧЕТОМ ЦЕНЫ ==========

let fillingCounter = 1;
let cakeBaseCounter = 1;

const componentPrices = {
    fillings: {
        'Strawberry': 150,
        'Blueberry': 180,
        'Chocolate': 200,
        'Caramel': 170,
        'Raspberry': 160,
        'Pistachio': 250
    },
    cakeBases: {
        'Vanilla sponge': 200,
        'Chocolate sponge': 220,
        'Honey sponge': 250,
        'Coconut sponge': 230
    }
};

function calculateTotalPrice() {
    const weight = parseFloat(document.getElementById('weight')?.value) || 1;
    const basePricePerKg = 950;
    
    const baseCost = weight * basePricePerKg;
    
    let cakeBaseCost = 0;
    const allCakeBases = document.querySelectorAll('select[id^="cake-base-"]');
    let hasCakeBase = false;
    
    allCakeBases.forEach(select => {
        const selectedValue = select.value;
        if (selectedValue && selectedValue !== 'Выберите бисквит...' && selectedValue !== '') {
            hasCakeBase = true;
            const price = componentPrices.cakeBases[selectedValue] || 200;
            cakeBaseCost += price;
        }
    });
    
    let fillingsCost = 0;
    const allFillings = document.querySelectorAll('select[id^="filling-"]');
    let hasFilling = false;
    
    allFillings.forEach(select => {
        const selectedValue = select.value;
        if (selectedValue && selectedValue !== 'Выберите начинку...' && selectedValue !== '') {
            hasFilling = true;
            const price = componentPrices.fillings[selectedValue] || 150;
            fillingsCost += price;
        }
    });
    
    const total = baseCost + cakeBaseCost + fillingsCost;
    
    const cakeBaseCostEl = document.getElementById('cake-base-cost');
    const fillingsCostEl = document.getElementById('fillings-cost');
    const totalPriceEl = document.getElementById('total-price');
    
    if (cakeBaseCostEl) cakeBaseCostEl.textContent = `${Math.round(cakeBaseCost)} ₽`;
    if (fillingsCostEl) fillingsCostEl.textContent = `${Math.round(fillingsCost)} ₽`;
    if (totalPriceEl) totalPriceEl.innerHTML = `${Math.round(total)} ₽`;
    
    window.constructorState = {
        hasFilling,
        hasCakeBase,
        total,
        weight
    };
    
    return total;
}

function validateConstructor() {
    const allFillings = document.querySelectorAll('select[id^="filling-"]');
    const allCakeBases = document.querySelectorAll('select[id^="cake-base-"]');
    
    let hasValidFilling = false;
    let hasValidCakeBase = false;
    
    allFillings.forEach(select => {
        const value = select.value;
        if (value && value !== 'Выберите начинку...' && value !== '') {
            hasValidFilling = true;
        }
    });
    
    allCakeBases.forEach(select => {
        const value = select.value;
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
    const container = document.getElementById('filling-container');
    const newId = fillingCounter++;
    const fillings = JSON.parse(safeLocalStorage.getItem('fillings') || '[]');
    
    const newDiv = document.createElement('div');
    newDiv.className = 'form-group';
    newDiv.id = `filling-group-${newId}`;
    newDiv.innerHTML = `
        <div class="form-row">
            <select id="filling-${newId}" style="flex: 1;" class="filling-select">
                <option value="" disabled selected>Выберите начинку...</option>
                ${fillings.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
            </select>
            <button type="button" class="remove-option-btn" data-id="${newId}" style="width: 48px; height: 48px; border-radius: var(--border-radius-sm); background: #ff4757; color: white; border: none; cursor: pointer; font-size: 20px;">✕</button>
        </div>
    `;
    container.appendChild(newDiv);
    
    newDiv.querySelector('.filling-select').addEventListener('change', calculateTotalPrice);
    newDiv.querySelector('.remove-option-btn').addEventListener('click', () => {
        newDiv.remove();
        calculateTotalPrice();
    });
    
    calculateTotalPrice();
}

function addNewCakeBase() {
    const container = document.getElementById('cake-base-container');
    const newId = cakeBaseCounter++;
    const cakeBases = JSON.parse(safeLocalStorage.getItem('cakeBases') || '[]');
    
    const newDiv = document.createElement('div');
    newDiv.className = 'form-group';
    newDiv.id = `cakebase-group-${newId}`;
    newDiv.innerHTML = `
        <div class="form-row">
            <select id="cake-base-${newId}" style="flex: 1;" class="cakebase-select">
                <option value="" disabled selected>Выберите бисквит...</option>
                ${cakeBases.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}
            </select>
            <button type="button" class="remove-option-btn" data-id="${newId}" style="width: 48px; height: 48px; border-radius: var(--border-radius-sm); background: #ff4757; color: white; border: none; cursor: pointer; font-size: 20px;">✕</button>
        </div>
    `;
    container.appendChild(newDiv);
    
    newDiv.querySelector('.cakebase-select').addEventListener('change', calculateTotalPrice);
    newDiv.querySelector('.remove-option-btn').addEventListener('click', () => {
        newDiv.remove();
        calculateTotalPrice();
    });
    
    calculateTotalPrice();
}

function updateConstructorSelects() {
    const fillings = JSON.parse(safeLocalStorage.getItem('fillings') || '[]');
    const cakeBases = JSON.parse(safeLocalStorage.getItem('cakeBases') || '[]');
    
    document.querySelectorAll('select[id^="filling-"]').forEach(select => {
        const currentVal = select.value;
        select.innerHTML = '<option value="" disabled selected>Выберите начинку...</option>' + 
            fillings.map(o => `<option value="${escapeHtml(o)}" ${currentVal === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
        select.removeEventListener('change', calculateTotalPrice);
        select.addEventListener('change', calculateTotalPrice);
    });
    
    document.querySelectorAll('select[id^="cake-base-"]').forEach(select => {
        const currentVal = select.value;
        select.innerHTML = '<option value="" disabled selected>Выберите бисквит...</option>' + 
            cakeBases.map(o => `<option value="${escapeHtml(o)}" ${currentVal === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
        select.removeEventListener('change', calculateTotalPrice);
        select.addEventListener('change', calculateTotalPrice);
    });
    
    calculateTotalPrice();
}

function addToCart(p) {
    const isCustomCake = p.isCustom === true;
    
    let existingItem;
    if (isCustomCake) {
        existingItem = cart.find(item => 
            item.isCustom === true && 
            JSON.stringify(item.customData) === JSON.stringify(p.customData)
        );
    } else {
        existingItem = cart.find(i => i.id === p.id);
    }
    
    if (existingItem) {
        existingItem.quantity = (existingItem.quantity || 0) + 1;
    } else {
        cart.push({
            ...p, 
            quantity: 1,
            id: p.id || Date.now()
        });
    }
    
    safeLocalStorage.setItem('cart', JSON.stringify(cart));
    updateCartUI();
    showToast(p.isCustom ? 'Индивидуальный торт добавлен в корзину!' : 'Товар добавлен в корзину', 'success');
}

function setupSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;
  
  let suggestionsContainer = document.getElementById('search-suggestions');
  if (!suggestionsContainer) {
    suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'search-suggestions';
    searchInput.parentNode.style.position = 'relative';
    searchInput.parentNode.appendChild(suggestionsContainer);
  }
  
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);
    suggestionsContainer.style.display = 'none';
    suggestionsContainer.innerHTML = '';
    
    if (query.length < 2) return;
    
    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/products/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('Search failed');
        const products = await res.json();
        if (!products.length) return;
        
        suggestionsContainer.innerHTML = products.map(p => `
          <div class="search-suggestion" data-id="${p.id}">
            <img src="${p.imageUrl || 'image/image 13.png'}" alt="">
            <div><strong>${escapeHtml(p.name)}</strong><div><small>${p.price} ₽</small></div></div>
          </div>
        `).join('');
        suggestionsContainer.style.display = 'block';
        
        document.querySelectorAll('.search-suggestion').forEach(el => {
          el.addEventListener('click', () => window.location.href = `product.html?id=${el.dataset.id}`);
        });
      } catch(e) { console.error('Search error:', e); }
    }, 400);
  });
  
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.style.display = 'none';
    }
  });
}

async function loadNotifications() {
  const token = getAuthToken();
  const badge = document.getElementById('notifications-badge');
  if (!token) { if (badge) badge.style.display = 'none'; return; }
  
  try {
    const notifications = await apiFetch('/notifications');
    const unreadCount = notifications.filter(n => !n.isRead).length;
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
    
    const list = document.getElementById('notifications-list');
    if (list) {
      list.innerHTML = notifications.length ? notifications.map(n => `
        <div class="notification-item" data-id="${n.id}" style="padding:12px;border-bottom:1px solid #eee;${!n.isRead ? 'background:#f9f0ff;' : ''}">
          <strong>${escapeHtml(n.title)}</strong><p style="margin:5px 0 0;font-size:14px;color:#666;">${escapeHtml(n.text)}</p>
          <small>${new Date(n.sentAt).toLocaleString()}</small>
        </div>
      `).join('') : '<p style="text-align:center;padding:20px;">Нет уведомлений</p>';
    }
  } catch(e) { if (badge) badge.style.display = 'none'; }
}

let currentChatId = null;

async function initChat() {
  const token = getAuthToken();
  const user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
  
  if (!token || user.role === 'pastry_chef') {
    const chatBtn = document.getElementById('chat-button');
    if (chatBtn) chatBtn.style.display = 'none';
    return;
  }
  
  const chatButton = document.getElementById('chat-button');
  if (chatButton) chatButton.style.display = 'block';
  
  document.querySelector('.chat-toggle-btn')?.addEventListener('click', async () => {
    await loadChats();
    openModal(document.getElementById('chat-modal'));
  });
  
  document.getElementById('send-message-btn')?.addEventListener('click', sendMessage);
  document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

async function loadChats() {
  try {
    const token = getAuthToken();
    const user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
    const response = await fetch(`${API_BASE}/chat`, { headers: { 'Authorization': `Bearer ${token}` } });
    const chats = await response.json();
    
    if (user.role === 'manager') {
      document.getElementById('chat-sidebar').style.display = 'block';
      const chatsList = document.getElementById('chats-list');
      chatsList.innerHTML = chats.map(chat => `
        <div class="chat-item" data-chat-id="${chat.id}">
          ${chat.user?.fullName || chat.user?.email || 'Пользователь'}
          ${chat.messages?.filter(m => !m.isRead && m.senderRole !== 'manager').length > 0 ? 
            `<span style="background:#ff4757;color:white;border-radius:10px;padding:2px 6px;font-size:10px;margin-left:8px;">
              ${chat.messages.filter(m => !m.isRead && m.senderRole !== 'manager').length}
            </span>` : ''}
        </div>
      `).join('');
      document.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', () => selectChat(el.dataset.chatId));
      });
      if (chats.length > 0 && !currentChatId) selectChat(chats[0].id);
    } else {
      if (chats.length === 0) {
        const createResponse = await fetch(`${API_BASE}/chat`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
        const newChat = await createResponse.json();
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
  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chatId == chatId);
  });
  await loadMessages(currentChatId);
  await markMessagesAsRead(currentChatId);
}

async function loadMessages(chatId) {
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/chat/${chatId}/messages`, { headers: { 'Authorization': `Bearer ${token}` } });
    const messages = await response.json();
    const currentUser = JSON.parse(safeLocalStorage.getItem('user') || '{}');
    const currentUserRole = currentUser.role;
    const messagesContainer = document.getElementById('chat-messages');
    
    messagesContainer.innerHTML = messages.map(msg => {
      const isCurrentUser = (currentUserRole === 'manager' && msg.senderRole === 'manager') ||
                           (currentUserRole === 'user' && msg.senderRole === 'user');
      const senderName = isCurrentUser ? 'Вы' : (msg.senderRole === 'manager' ? 'Менеджер' : 'Клиент');
      const messageClass = isCurrentUser ? 'user' : 'manager';
      return `<div class="chat-message ${messageClass}"><div class="sender">${senderName}</div><div>${escapeHtml(msg.message)}</div><div class="time">${new Date(msg.sentAt).toLocaleTimeString()}</div></div>`;
    }).join('');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    const unreadCount = messages.filter(m => !m.isRead && 
      ((currentUserRole === 'manager' && m.senderRole === 'user') ||
       (currentUserRole === 'user' && m.senderRole === 'manager'))).length;
    const badge = document.querySelector('.chat-unread-badge');
    if (unreadCount > 0) { badge.textContent = unreadCount; badge.style.display = 'flex'; }
    else badge.style.display = 'none';
  } catch(e) { console.error('Load messages error:', e); }
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || !currentChatId) return;
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/chat/${currentChatId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
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
    const token = getAuthToken();
    await fetch(`${API_BASE}/chat/${chatId}/read`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
  } catch(e) { console.error('Mark read error:', e); }
}

let currentCartTotal = 0;

function setupCheckout() {
    const deliveryType = document.getElementById('delivery-type');
    const addressGroup = document.getElementById('address-group');
    
    if (deliveryType) {
        deliveryType.addEventListener('change', () => {
            if (addressGroup) {
                addressGroup.style.display = deliveryType.value === 'delivery' ? 'block' : 'none';
            }
            updateCheckoutTotal();
        });
    }
    
    const form = document.getElementById('checkout-form');
    if (form) {
        form.addEventListener('submit', async (e) => { 
            e.preventDefault(); 
            await processOrder(); 
        });
    }
    
    const dateInput = document.getElementById('checkout-delivery-date');
    if (dateInput) {
        const tomorrow = new Date(); 
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.min = tomorrow.toISOString().split('T')[0];
        dateInput.value = tomorrow.toISOString().split('T')[0];
    }
}

function updateCheckoutTotal() {
    const deliveryType = document.getElementById('delivery-type');
    if (!deliveryType) return;
    
    const subtotal = currentCartTotal;
    const deliveryFee = deliveryType.value === 'delivery' ? 250 : 0;
    const total = deliveryType.value === 'pickup' ? subtotal * 0.85 : subtotal + deliveryFee;
    
    const subtotalEl = document.getElementById('checkout-subtotal');
    const deliveryFeeItem = document.getElementById('delivery-fee-item');
    const totalEl = document.getElementById('checkout-total');
    
    if (subtotalEl) subtotalEl.textContent = `${Math.round(subtotal)} ₽`;
    if (deliveryFeeItem) deliveryFeeItem.style.display = deliveryType.value === 'delivery' ? 'block' : 'none';
    if (totalEl) totalEl.textContent = `${Math.round(total)} ₽`;
}

async function processOrder() {
    const user = JSON.parse(safeLocalStorage.getItem('user') || '{}');
    if (!user || user.role !== 'user') { 
        showToast('Войдите как клиент', 'warning');
        return; 
    }
    
    const deliveryType = document.getElementById('delivery-type').value;
    const paymentMethod = document.getElementById('payment-method').value;
    const deliveryDate = document.getElementById('checkout-delivery-date').value;
    const comments = document.getElementById('order-comments').value;
    
    let deliveryAddress = '';
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
    
    let total = currentCartTotal;
    if (deliveryType === 'pickup') total = total * 0.85;
    else if (deliveryType === 'delivery') total = total + 250;
    
    const orderData = {
        total: Math.round(total),
        deliveryAddress: deliveryAddress || 'Самовывоз',
        comments: comments,
        deliveryDate: deliveryDate,
        paymentMethod: paymentMethod,
        items: cart.map(i => ({
            productId: (i.id && i.id <= 9000000 && !i.isCustom) ? i.id : null,
            isCustom: i.isCustom || false,
            name: i.name,
            description: i.desc,
            weight: parseFloat(i.weight) || 1,
            price: i.price,
            quantity: i.quantity || 1,
            customData: i.customData || null
        }))
    };
    
    try {
        const response = await apiFetch('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        
        let orderId = null;
        
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
            window.location.href = `payment.html?orderId=${orderId}`;
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

function openPaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) {
        modal.classList.add('active');
        loadPaymentData();
    } else {
        console.error('Payment modal not found');
    }
}

function closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function loadPaymentData() {
    const orderDataStr = safeLocalStorage.getItem('pendingOrderData');
    if (!orderDataStr) return;
    
    const orderData = JSON.parse(orderDataStr);
    const cartItems = JSON.parse(safeLocalStorage.getItem('pendingCart') || '[]');
    const total = orderData.total;
    
    const orderSummary = document.getElementById('payment-order-summary');
    if (orderSummary) {
        let itemsHtml = '<div style="margin-bottom: 15px;"><strong>Ваш заказ:</strong></div>';
        cartItems.forEach(item => {
            const qty = item.quantity || 1;
            const itemTotal = (item.price || 0) * qty;
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>${escapeHtml(item.name)} × ${qty}</span>
                    <span>${itemTotal.toFixed(0)} ₽</span>
                </div>
            `;
        });
        itemsHtml += `
            <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; font-weight: bold;">
                <span>Итого:</span>
                <span style="color: var(--primary);">${total} ₽</span>
            </div>
        `;
        orderSummary.innerHTML = itemsHtml;
    }
    
    const sumInput = document.getElementById('payment-sum');
    if (sumInput) {
        sumInput.value = total;
    }
}

function setupCatalogToggle() {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;
    
    // Создаём контейнер для обёртки, если его нет
    let wrapper = grid.parentElement;
    if (!wrapper.classList.contains('catalog-grid-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'catalog-grid-wrapper';
        wrapper.style.cssText = 'transition: max-height 0.3s ease-out; overflow: hidden; max-height: none;';
        grid.parentNode.insertBefore(wrapper, grid);
        wrapper.appendChild(grid);
    }
    
    function updateToggleButton() {
        const items = grid.querySelectorAll('.cheesecake-card');
        const needToggle = items.length > 3;
        
        let toggleContainer = document.querySelector('.catalog-toggle-container');
        
        if (needToggle) {
            if (!toggleContainer) {
                toggleContainer = document.createElement('div');
                toggleContainer.className = 'catalog-toggle-container';
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'catalog-toggle-btn';
                toggleBtn.innerHTML = `<span class="toggle-text">Показать все</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
                toggleContainer.appendChild(toggleBtn);
                wrapper.parentNode.insertBefore(toggleContainer, wrapper.nextSibling);
                
                let isExpanded = false;
                
                setTimeout(() => {
                    const cardHeight = items[0]?.offsetHeight || 400;
                    wrapper.style.maxHeight = `${cardHeight * 2 + 30}px`;
                    isExpanded = false;
                    toggleBtn.querySelector('.toggle-text').textContent = 'Показать все';
                    toggleBtn.querySelector('svg').style.transform = 'rotate(0deg)';
                }, 100);
                
                toggleBtn.addEventListener('click', () => {
                    if (isExpanded) {
                        const cardHeight = items[0]?.offsetHeight || 400;
                        wrapper.style.maxHeight = `${cardHeight * 2 + 30}px`;
                        toggleBtn.querySelector('.toggle-text').textContent = 'Показать все';
                        toggleBtn.querySelector('svg').style.transform = 'rotate(0deg)';
                    } else {
                        wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
                        toggleBtn.querySelector('.toggle-text').textContent = 'Свернуть';
                        toggleBtn.querySelector('svg').style.transform = 'rotate(180deg)';
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
    
    const observer = new MutationObserver(() => {
        setTimeout(updateToggleButton, 100);
    });
    observer.observe(grid, { childList: true, subtree: true });
    
    setTimeout(updateToggleButton, 100);
}

async function loadComponentsAdmin() {
  const token = getAuthToken();
  if (!token) return;
  try {
    const fillingsRes = await fetch(`${API_BASE}/components/fillings`, { headers: { 'Authorization': `Bearer ${token}` } });
    const fillings = await fillingsRes.json();
    const fillingsList = document.getElementById('fillings-list');
    if (fillingsList) {
      fillingsList.innerHTML = fillings.map(f => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;"><span>🍯 ${escapeHtml(f.name)}</span><button class="delete-component-btn" data-id="${f.id}" data-type="filling" style="background:#ff4757;color:white;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;">×</button></div>`).join('');
    }
    const basesRes = await fetch(`${API_BASE}/components/cakeBases`, { headers: { 'Authorization': `Bearer ${token}` } });
    const bases = await basesRes.json();
    const basesList = document.getElementById('cake-bases-list');
    if (basesList) {
      basesList.innerHTML = bases.map(b => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;"><span>🍰 ${escapeHtml(b.name)}</span><button class="delete-component-btn" data-id="${b.id}" data-type="cakeBase" style="background:#ff4757;color:white;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;">×</button></div>`).join('');
    }
    document.querySelectorAll('.delete-component-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const componentId = btn.dataset.id;
        const componentType = btn.dataset.type === 'filling' ? 'начинку' : 'бисквит';
        if (confirm(`Удалить ${componentType}?`)) {
          try {
            const response = await fetch(`${API_BASE}/components/${componentId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
            if (!response.ok) throw new Error((await response.json()).message || 'Ошибка удаления');
            showToast(`${componentType} удалена!`, 'success');
            loadComponentsAdmin();
            loadComponents();
          } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
        }
      });
    });
  } catch(e) { console.error('Load components admin error:', e); }
}

async function loadPendingReviews() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE}/reviews/pending`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки');
        const reviews = await response.json();
        
        const container = document.getElementById('pending-reviews-list');
        if (!container) {
            console.log('Контейнер pending-reviews-list не найден');
            return;
        }
        
        if (reviews.length === 0) {
            container.innerHTML = '<p style="padding: 20px; text-align: center; color: #888;">✅ Нет отзывов на модерации</p>';
            return;
        }
        
        container.innerHTML = reviews.map(r => `
            <div class="pending-review" data-id="${r.id}" style="border: 1px solid #eee; padding: 15px; margin-bottom: 10px; border-radius: 12px; background: #fff;">
                <strong>👤 ${escapeHtml(r.authorName || 'Аноним')}</strong>
                <small style="color: #888; margin-left: 10px;">${new Date(r.createdAt).toLocaleDateString()}</small>
                <p style="margin: 10px 0; word-wrap: break-word;">${escapeHtml(r.text)}</p>
                <div style="display: flex; gap: 10px;">
                    <button class="approve-review-btn btn" data-id="${r.id}" style="background: #4caf50; padding: 6px 16px; font-size: 14px;">✅ Одобрить</button>
                    <button class="delete-review-btn" data-id="${r.id}" style="background: #ff4757; padding: 6px 16px; font-size: 14px;">❌ Удалить</button>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.approve-review-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const reviewId = btn.dataset.id;
                if (confirm('Одобрить этот отзыв? Он сразу появится на сайте.')) {
                    try {
                        const approveResponse = await fetch(`${API_BASE}/reviews/${reviewId}/approve`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${token}` }
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
        
        document.querySelectorAll('#pending-reviews-list .delete-review-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const reviewId = btn.dataset.id;
                if (confirm('Удалить этот отзыв без публикации?')) {
                    try {
                        const deleteResponse = await fetch(`${API_BASE}/reviews/${reviewId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (deleteResponse.ok) {
                            showToast('Отзыв удалён', 'success');
                            loadPendingReviews();
                        } else {
                            showToast('Ошибка при удалении', 'error');
                        }
                    } catch(e) {
                        showToast('Ошибка: ' + e.message, 'error');
                    }
                }
            });
        });
        
    } catch(e) {
        console.error('Load pending reviews error:', e);
        const container = document.getElementById('pending-reviews-list');
        if (container) {
            container.innerHTML = '<p style="color: #ff4757; padding: 20px;">❌ Ошибка загрузки отзывов на модерацию</p>';
        }
    }
}

function initConstructor() {
    document.getElementById('add-filling-btn')?.addEventListener('click', addNewFilling);
    document.getElementById('add-cake-base-btn')?.addEventListener('click', addNewCakeBase);
    
    const weightInput = document.getElementById('weight');
    if (weightInput) {
        weightInput.addEventListener('input', calculateTotalPrice);
        weightInput.addEventListener('change', calculateTotalPrice);
    }
    
    const deliveryDate = document.getElementById('delivery-date');
    if (deliveryDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        deliveryDate.min = deliveryDate.value = tomorrow.toISOString().split('T')[0];
    }
    
    setTimeout(calculateTotalPrice, 100);
}

document.addEventListener('DOMContentLoaded', () => {
  const burgerDropdown = document.querySelector('.burger-dropdown');
  if (burgerDropdown && !document.getElementById('auth-btn-in-burger')) {
    const authInBurger = document.createElement('button');
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
  
  const categorySelect = document.getElementById('category-select');
  if (categorySelect) categorySelect.addEventListener('change', (e) => renderCatalog(e.target.value));
  
  const notifBtn = document.getElementById('notifications-btn');
  const notifModal = document.getElementById('notifications-modal');
  if (notifBtn && notifModal) notifBtn.addEventListener('click', async () => { await loadNotifications(); openModal(notifModal); document.body.style.overflow = 'hidden'; });
  
  const clearNotifBtn = document.getElementById('clear-notifications-btn');
  if (clearNotifBtn) clearNotifBtn.addEventListener('click', async () => { await apiFetch('/notifications/clear', { method: 'DELETE' }); await loadNotifications(); });
  
  const openBasket = document.getElementById('open-basket');
  const basketModal = document.getElementById('basket-modal');
  if (openBasket && basketModal) openBasket.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); updateCartUI(); openModal(basketModal); document.body.style.overflow = 'hidden'; });
  
  document.querySelectorAll('#basket-modal .modal-close, #basket-modal .modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el || el.classList.contains('modal-close')) { closeModal(basketModal); document.body.style.overflow = ''; } });
  });
  
  document.querySelector('.basket-items')?.addEventListener('click', e => {
    const item = e.target.closest('.basket-item');
    if (!item) return;
    const idx = +item.dataset.index;
    if (e.target.classList.contains('dec')) {
      if (cart[idx].quantity > 1) cart[idx].quantity--;
      else cart.splice(idx,1);
    } else if (e.target.classList.contains('inc')) {
      cart[idx].quantity = (cart[idx].quantity||0)+1;
    } else if (e.target.classList.contains('remove-btn')) {
      if (confirm('Удалить?')) cart.splice(idx,1);
    } else return;
    safeLocalStorage.setItem('cart', JSON.stringify(cart));
    updateCartUI();
  });
  
  document.getElementById('checkout-btn')?.addEventListener('click', () => {
    if (!cart.length) { showToast('Корзина пуста', 'warning'); return; }
    currentCartTotal = cart.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    updateCheckoutTotal();
    openModal(document.getElementById('checkout-modal'));
  });
  
  const authModal = document.getElementById('auth-modal');
  const loginTab = document.querySelector('.auth-tab[data-tab="login"]');
  const registerTab = document.querySelector('.auth-tab[data-tab="register"]');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  
  if (loginTab && registerTab) {
    loginTab.addEventListener('click', () => { loginTab.classList.add('active'); registerTab.classList.remove('active'); loginForm.classList.add('active'); registerForm.classList.remove('active'); });
    registerTab.addEventListener('click', () => { registerTab.classList.add('active'); loginTab.classList.remove('active'); registerForm.classList.add('active'); loginForm.classList.remove('active'); });
  }
  
  document.getElementById('auth-btn')?.addEventListener('click', () => {
    const u = JSON.parse(safeLocalStorage.getItem('user')||'{}');
    if (u.FullName || u.name) window.location.href = 'profile.html';
    else openModal(authModal);
  });
  
  const burgerAuthBtn = document.getElementById('auth-btn-in-burger');
  if (burgerAuthBtn) burgerAuthBtn.addEventListener('click', () => openModal(authModal));
  
  document.getElementById('profile-link-btn')?.addEventListener('click', () => window.location.href = 'profile.html');
  
  document.getElementById('admin-panel-btn')?.addEventListener('click', () => { 
    loadComponentsAdmin();
    loadPendingReviews();
    openModal(document.getElementById('admin-modal')); 
});
  
 document.getElementById('orders-btn')?.addEventListener('click', async () => {
    const modal = document.getElementById('orders-modal');
    const ordersList = document.getElementById('orders-list');
    if (ordersList) {
      try {
        const orders = await apiFetch('/orders');
        console.log('Orders loaded:', orders);
        
        if (!orders || orders.length === 0) {
          ordersList.innerHTML = '<p style="text-align: center; padding: 40px; color: #888;">Заказов пока нет</p>';
        } else {
          ordersList.innerHTML = orders.map(order => {
            let itemsHtml = '';
            if (order.orderItems && order.orderItems.length > 0) {
              itemsHtml = '<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #eee;"><strong>Состав заказа:</strong><ul style="margin-top: 8px; margin-left: 20px;">';
              order.orderItems.forEach(item => {
                const itemName = item.product?.name || item.customCake?.name || 'Индивидуальный торт';
                itemsHtml += `<li>${escapeHtml(itemName)} × ${item.quantity} — ${item.unitPrice} ₽</li>`;
              });
              itemsHtml += '</ul></div>';
            } else {
              itemsHtml = '<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #eee; color: #888;">Состав заказа не указан</div>';
            }
            
            return `
              <div class="card" style="margin-bottom: 16px; padding: 16px; border: 1px solid #eee; border-radius: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
                  <strong style="font-size: 16px;">Заказ #${order.id}</strong>
                  <span class="order-status status-${getStatusClass(order.status)}" style="padding: 4px 12px; border-radius: 20px; font-size: 12px;">${order.status}</span>
                </div>
                <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
                  <span><strong>Сумма:</strong> ${order.totalAmount} ₽</span>
                  <span><strong>Дата получения:</strong> ${order.desiredDeliveryDate}</span>
                </div>
                <div><strong>Способ оплаты:</strong> ${getPaymentMethodName(order.paymentMethod)}</div>
                ${order.deliveryAddress && order.deliveryAddress !== 'Самовывоз' ? `<div><strong>Адрес доставки:</strong> ${escapeHtml(order.deliveryAddress)}</div>` : '<div><strong>Самовывоз</strong></div>'}
                ${order.comments ? `<div><strong>Комментарий:</strong> ${escapeHtml(order.comments)}</div>` : ''}
                ${itemsHtml}
                <select data-order="${order.id}" class="order-status-select" style="margin-top: 12px; padding: 6px 12px; border-radius: 8px; border: 1px solid #ddd; width: 100%; max-width: 200px;">
                  <option value="Новый" ${order.status === 'Новый' ? 'selected' : ''}>Новый</option>
                  <option value="В работе" ${order.status === 'В работе' ? 'selected' : ''}>В работе</option>
                  <option value="Готов" ${order.status === 'Готов' ? 'selected' : ''}>Готов</option>
                  <option value="Доставлен" ${order.status === 'Доставлен' ? 'selected' : ''}>Доставлен</option>
                </select>
              </div>
            `;
          }).join('');
        }
        
        // Добавляем обработчики для изменения статуса
        document.querySelectorAll('.order-status-select').forEach(sel => {
          sel.addEventListener('change', async (e) => {
            try {
              await apiFetch(`/orders/${sel.dataset.order}/status`, { 
                method: 'PUT', 
                body: JSON.stringify({ status: e.target.value }) 
              });
              showToast('Статус заказа обновлён', 'success');
              // Обновляем список заказов
              document.getElementById('orders-btn').click();
            } catch(err) {
              showToast('Ошибка обновления статуса: ' + err.message, 'error');
            }
          });
        });
        
      } catch(e) { 
        console.error('Orders load error:', e);
        ordersList.innerHTML = '<p style="text-align: center; padding: 40px; color: #ff4757;">❌ Ошибка загрузки заказов</p>'; 
      }
    }
    openModal(modal);
});

function getPaymentMethodName(method) {
    const methodMap = {
        'cash': 'Наличными при получении',
        'card': 'Картой при получении',
        'online': 'Онлайн-оплата'
    };
    return methodMap[method] || method || 'Картой при получении';
}

function getStatusClass(status) {
    const statusMap = {
        'Новый': 'new',
        'В работе': 'work',
        'Готов': 'ready',
        'Доставлен': 'delivered',
        'Ожидает оплаты': 'new'
    };
    return statusMap[status] || 'new';
}
  
 document.getElementById('login-submit')?.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showToast('Введите email и пароль', 'warning');
        return;
    }
    
    try {
        const d = await apiFetch('/auth/login', { 
            method: 'POST', 
            body: JSON.stringify({ email, password }) 
        });
        safeLocalStorage.setItem('authToken', d.token);
        safeLocalStorage.setItem('user', JSON.stringify(d.user));
        showToast('Вход выполнен!', 'success');
        closeModal(authModal);
        updateAuthUI();
        loadNotifications();
        window.location.reload();
    } catch(e) {
        let errorMsg = e.message;
        errorMsg = errorMsg.replace(/API \d+: /, '');
        
        if (errorMsg.includes('завершена') || errorMsg.includes('подтвердите')) {
            const resendConfirm = confirm('Регистрация не завершена! Отправить письмо с подтверждением повторно?');
            if (resendConfirm) {
                try {
                    const resendResponse = await apiFetch('/auth/resend-confirmation', {
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
  
document.getElementById('register-submit')?.addEventListener('click', async () => {
    try {
        await apiFetch('/auth/register', { 
            method:'POST', 
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
        let errorMsg = e.message;
        errorMsg = errorMsg.replace(/API \d+: /, '');
        showToast(errorMsg, 'error');
    }
});
  
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    ['authToken','user','cart'].forEach(k => safeLocalStorage.removeItem(k));
    cart = [];
    updateAuthUI();
    updateCartUI();
    showToast('Вы вышли из аккаунта', 'info');
    window.location.reload();
  });
  
  document.getElementById('submit-review')?.addEventListener('click', async () => {
    const name = document.getElementById('review-name').value.trim();
    const text = document.getElementById('review-text').value.trim();
    if (!name||!text) {
        showToast('Заполните поля', 'warning');
        return;
    }
    try {
      await apiFetch('/reviews', { method:'POST', body: JSON.stringify({ authorName: name, text }) });
      document.getElementById('review-name').value = '';
      document.getElementById('review-text').value = '';
      loadReviews();
      showToast('Отзыв добавлен и отправлен на модерацию', 'success');
    } catch(e) { 
        let errorMsg = e.message;
        errorMsg = errorMsg.replace(/API \d+: /, '');
        showToast(errorMsg, 'error');
    }
  });
  
  const addProductBtn = document.getElementById('add-product-btn');
  if (addProductBtn) {
    addProductBtn.addEventListener('click', async () => {
      const editId = document.getElementById('edit-product-id').value;
      const fileInput = document.getElementById('admin-product-img-file');
      let imageUrl = document.getElementById('admin-product-img-url').value;
      const name = document.getElementById('admin-product-name').value.trim();
      const description = document.getElementById('admin-product-desc').value.trim();
      const price = parseFloat(document.getElementById('admin-product-price').value);
      const weight = document.getElementById('admin-product-weight').value.trim();
      const category = document.getElementById('admin-product-category').value;
      
      if (!name) { showToast('Введите название товара', 'warning'); return; }
      if (isNaN(price) || price <= 0) { showToast('Введите корректную цену', 'warning'); return; }
      
      const hasNewFile = fileInput && fileInput.files && fileInput.files.length > 0;
      
      if (hasNewFile) {
        const file = fileInput.files[0];
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) { 
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
      
      const product = { 
        name, 
        description, 
        price, 
        weight, 
        category, 
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
          await apiFetch(`/products/${editId}`, { method: 'PUT', body: JSON.stringify(product) }); 
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
        let errorMsg = err.message;
        errorMsg = errorMsg.replace(/API \d+: /, '');
        showToast('Ошибка сохранения: ' + errorMsg, 'error'); 
      }
    });
  }
  
  const selectImageBtn = document.getElementById('select-image-btn');
  const imageFileInput = document.getElementById('admin-product-img-file');
  const imagePreview = document.getElementById('selected-image-preview');
  const previewImg = document.getElementById('preview-img');
  const clearImageBtn = document.getElementById('clear-image-btn');
  if (selectImageBtn && imageFileInput) {
    selectImageBtn.addEventListener('click', () => imageFileInput.click());
    imageFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && previewImg && imagePreview) {
        const reader = new FileReader();
        reader.onload = (event) => { previewImg.src = event.target.result; imagePreview.style.display = 'block'; };
        reader.readAsDataURL(file);
      } else if (imagePreview) { imagePreview.style.display = 'none'; }
    });
    if (clearImageBtn && imagePreview) clearImageBtn.addEventListener('click', () => { imageFileInput.value = ''; imagePreview.style.display = 'none'; if (previewImg) previewImg.src = ''; });
  }
  
  document.getElementById('admin-add-filling-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('new-filling-name').value.trim();
    if (!name) { showToast('Введите название', 'warning'); return; }
    try { await apiFetch('/components/fillings', { method:'POST', body: JSON.stringify({ name }) }); showToast('Начинка добавлена', 'success'); document.getElementById('new-filling-name').value = ''; loadComponentsAdmin(); loadComponents(); } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
  });
  
  document.getElementById('admin-add-cake-base-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('new-cake-base-name').value.trim();
    if (!name) { showToast('Введите название', 'warning'); return; }
    try { await apiFetch('/components/cakeBases', { method:'POST', body: JSON.stringify({ name }) }); showToast('Бисквит добавлен', 'success'); document.getElementById('new-cake-base-name').value = ''; loadComponentsAdmin(); loadComponents(); } catch(e) { showToast('Ошибка: ' + e.message, 'error'); }
  });
  
  document.getElementById('add-constructor-to-cart')?.addEventListener('click', () => {
    if (!validateConstructor()) return;
    
    const weight = Math.max(0.5, parseFloat(document.getElementById('weight')?.value) || 1);
    const deliveryDate = document.getElementById('delivery-date')?.value;
    
    if (!deliveryDate) {
        showToast('Укажите дату получения', 'warning');
        return;
    }
    
    const selectedFillings = [];
    document.querySelectorAll('select[id^="filling-"]').forEach(select => {
        const value = select.value;
        if (value && value !== 'Выберите начинку...' && value !== '') {
            selectedFillings.push(value);
        }
    });
    
    const selectedCakeBases = [];
    document.querySelectorAll('select[id^="cake-base-"]').forEach(select => {
        const value = select.value;
        if (value && value !== 'Выберите бисквит...' && value !== '') {
            selectedCakeBases.push(value);
        }
    });
    
    const totalPrice = window.constructorState?.total || calculateTotalPrice();
    const designNotes = document.getElementById('design-notes')?.value || '';
    
    const description = `🍰 Вес: ${weight} кг | Бисквит: ${selectedCakeBases.join(', ')} | Начинки: ${selectedFillings.join(', ')}${designNotes ? ` | Пожелания: ${designNotes.substring(0, 100)}` : ''}`;
    
    addToCart({
        id: null,
        name: `Индивидуальный торт (${weight} кг)`,
        desc: description.substring(0, 200),
        price: totalPrice,
        img: 'image/image 13.png',
        weight: `${weight} кг`,
        isCustom: true,
        customData: {
            weight,
            fillings: selectedFillings,
            cakeBases: selectedCakeBases,
            designNotes,
            deliveryDate
        }
    });
    
    openModal(basketModal);
    calculateTotalPrice();
  });
  
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close')) {
      document.querySelectorAll('.modal-overlay.active').forEach(closeModal);
      document.body.style.overflow = '';
    }
  });
  
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.active').forEach(closeModal); document.body.style.overflow = ''; }
  });
  
  const dd = document.getElementById('delivery-date');
  if (dd) { const t = new Date(); t.setDate(t.getDate() + 1); dd.min = dd.value = t.toISOString().split('T')[0]; }
  
  if (new URLSearchParams(location.search).get('auth') === 'login') {
    setTimeout(() => { if (authModal) openModal(authModal); }, 150);
  }
});