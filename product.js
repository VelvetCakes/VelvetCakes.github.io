const API_BASE = 'https://velvet-cakes-api.onrender.com/api';
const params = new URLSearchParams(location.search);
const id = params.get('id');

if (!id) {
  document.getElementById('product-container').innerHTML = '<div class="error">Товар не найден</div>';
  throw new Error('No ID');
}

async function loadProduct() {
  const container = document.getElementById('product-container');
  
  try {
    const response = await fetch(`${API_BASE}/products/${id}`);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const product = await response.json();
    
    if (!product || !product.name) throw new Error('Некорректные данные товара');
    
    container.innerHTML = `
      <img id="p-img" src="${escapeHtml(product.imageUrl || 'image/image 13.png')}" alt="${escapeHtml(product.name)}">
      <div>
        <h1 id="p-name">${escapeHtml(product.name)}</h1>
        <p id="p-desc" style="color:var(--text-secondary);margin:12px 0">${escapeHtml(product.description || '')}</p>
        <p class="price-big"><span id="p-price">${product.price}</span> ₽</p>
        <div class="actions">
          <button class="btn" id="add-cart">В корзину</button>
          <button class="btn" id="add-fav" style="background:#f0f0f0;color:#333">❤️ В избранное</button>
          <button class="btn" onclick="history.back()" style="background:#ccc">← Назад</button>
        </div>
      </div>
    `;
    
    document.getElementById('add-cart').onclick = () => {
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      const ex = cart.find(i => i.id === product.id);
      if (ex) ex.quantity = (ex.quantity || 0) + 1;
      else cart.push({ id: product.id, name: product.name, desc: product.description || '', price: product.price, img: product.imageUrl || 'image/image 13.png', weight: product.weight || '', quantity: 1 });
      localStorage.setItem('cart', JSON.stringify(cart));
      alert('Добавлено в корзину!');
      if (window.opener && window.opener.updateCartUI) window.opener.updateCartUI();
    };
    
    const favBtn = document.getElementById('add-fav');
    favBtn.onclick = async () => {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (!token) { alert('Войдите в аккаунт, чтобы добавить в избранное'); return; }
      try {
        const res = await fetch(`${API_BASE}/api/favorites`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(product.id) });
        if (res.ok) { favBtn.style.background = '#ffe6ee'; favBtn.textContent = '❤️ В избранном'; favBtn.disabled = true; }
        else { const err = await res.text(); alert(err === 'Уже в избранном' ? 'Товар уже в избранном' : 'Ошибка'); }
      } catch(e) { alert('Ошибка: ' + e.message); }
    };
    
  } catch (error) {
    console.error('Load error:', error);
    container.innerHTML = `<div class="error">⚠️ Ошибка загрузки товара<br><small>${error.message}</small><br><br><button class="btn" onclick="location.reload()">Обновить страницу</button></div>`;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    return '&#39;';
  });
}

loadProduct();

document.getElementById('auth-btn').addEventListener('click', () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.FullName || user.name) window.location.href = 'profile.html';
  else window.location.href = 'index.html?auth=login';
});