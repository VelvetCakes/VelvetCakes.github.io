const API_BASE = 'https://velvet-cakes-api.onrender.com/api';

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    const contentEl = document.getElementById('profile-content');
    
    if (!token) {
        contentEl.innerHTML = `<div style="text-align:center;padding:60px 20px;background:#fff;border-radius:24px;border:1px solid #eee;max-width:500px;margin:40px auto;"><h2 style="margin-bottom:12px;">Доступ к личному кабинету</h2><p style="color:#666;margin-bottom:24px;">Войдите, чтобы видеть заказы, отзывы и избранное.</p><button class="btn" id="go-to-login-btn">Войти в аккаунт</button></div>`;
        document.getElementById('go-to-login-btn')?.addEventListener('click', () => window.location.href = 'index.html?auth=login');
        return;
    }
    
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('back-home')?.addEventListener('click', () => window.location.href = 'index.html');
    
    let ordersCount = 0, reviewsCount = 0, favoritesCount = 0;
    
    async function loadDashboard() {
        const headers = { 'Authorization': `Bearer ${token}` };
        
        try {
            const ordersRes = await fetch(`${API_BASE}/orders/my`, { headers });
            if (ordersRes.ok) { const orders = await ordersRes.json(); ordersCount = orders.length; }
            const reviewsRes = await fetch(`${API_BASE}/reviews/my`, { headers });
            if (reviewsRes.ok) { const reviews = await reviewsRes.json(); reviewsCount = reviews.length; }
            const favsRes = await fetch(`${API_BASE}/favorites`, { headers });
            if (favsRes.ok) { const favs = await favsRes.json(); favoritesCount = favs.length; }
        } catch(e) { console.error('Stats error:', e); }
        
        const roleMap = { user: 'Клиент', manager: 'Менеджер', pastry_chef: 'Кондитер' };
        const displayName = user.FullName || user.fullName || user.name || 'Пользователь';
        const userRole = roleMap[user.Role || user.role] || (user.Role || user.role);
        
        contentEl.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar">${escapeHtml(displayName[0]?.toUpperCase() || 'П')}</div>
                <div>
                    <h2>${escapeHtml(displayName)}</h2>
                    <p style="color:#666;">${user.Email || user.email || '—'}</p>
                    <p><span style="background:var(--primary); color:white; padding:4px 12px; border-radius:20px; font-size:12px;">${userRole}</span></p>
                </div>
                <div class="profile-stats">
                    <div class="stat-card"><div class="stat-number">${ordersCount}</div><div class="stat-label">Заказов</div></div>
                    <div class="stat-card"><div class="stat-number">${reviewsCount}</div><div class="stat-label">Отзывов</div></div>
                    <div class="stat-card"><div class="stat-number">${favoritesCount}</div><div class="stat-label">В избранном</div></div>
                </div>
            </div>
            <div class="tabs">
                <button class="tab-btn active" data-tab="orders">📦 Заказы</button>
                <button class="tab-btn" data-tab="reviews">✍️ Отзывы</button>
                <button class="tab-btn" data-tab="favs">❤️ Избранное</button>
                <button class="tab-btn" data-tab="settings">⚙️ Настройки</button>
            </div>
            <div id="tab-content"></div>
            <div class="logout-btn-container"><button class="logout-btn" id="logout-btn">Выйти из аккаунта</button></div>
        `;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadTab(btn.dataset.tab);
            });
        });
        
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'index.html';
        });
        
        loadTab('orders');
    }
    
    async function loadTab(tab) {
        const c = document.getElementById('tab-content');
        c.innerHTML = '<p style="text-align:center;padding:20px;">Загрузка...</p>';
        const headers = { 'Authorization': `Bearer ${token}` };
        
        try {
            if (tab === 'orders') {
                const res = await fetch(`${API_BASE}/orders/my`, { headers });
                if (!res.ok) throw new Error(`Ошибка ${res.status}`);
                const orders = await res.json();
                if (!orders.length) { c.innerHTML = '<div class="card"><p style="text-align:center;color:#888;">У вас пока нет заказов</p></div>'; return; }
                c.innerHTML = orders.map(order => `
                    <div class="order-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                            <h3 style="margin:0;">Заказ #${order.id}</h3>
                            <span class="order-status status-${getStatusClass(order.status)}">${order.status}</span>
                        </div>
                        <p style="margin:12px 0;">Сумма: <strong>${order.totalAmount} ₽</strong></p>
                        <p>Дата получения: ${order.desiredDeliveryDate}</p>
                        <p>Способ оплаты: ${order.paymentMethod || 'Картой при получении'}</p>
                        ${order.deliveryAddress && order.deliveryAddress !== 'Самовывоз' ? `<p>Доставка по адресу: ${escapeHtml(order.deliveryAddress)}</p>` : '<p>Самовывоз</p>'}
                        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #eee; font-size:14px; color:#666;">
                            ${order.orderItems?.map(item => `<div>• ${item.product?.name || item.customCake?.name || 'Индивидуальный торт'} × ${item.quantity}</div>`).join('') || 'Состав заказа не указан'}
                        </div>
                    </div>
                `).join('');
            }
            else if (tab === 'reviews') {
                const res = await fetch(`${API_BASE}/reviews/my`, { headers });
                if (!res.ok) throw new Error(`Ошибка ${res.status}`);
                const reviews = await res.json();
                if (!reviews.length) { c.innerHTML = '<div class="card"><p style="text-align:center;color:#888;">Вы ещё не оставили отзывы</p></div>'; return; }
                c.innerHTML = reviews.map(r => `<div class="card"><p style="color:#666; margin-bottom:8px;">${new Date(r.createdAt).toLocaleDateString('ru-RU')}</p><p>${escapeHtml(r.text)}</p></div>`).join('');
            }
            else if (tab === 'favs') {
                const res = await fetch(`${API_BASE}/favorites`, { headers });
                if (!res.ok) throw new Error(`Ошибка ${res.status}`);
                const favs = await res.json();
                if (!favs.length) { c.innerHTML = '<div class="card"><p style="text-align:center;color:#888;">В избранном пока ничего нет</p></div>'; return; }
                c.innerHTML = favs.map(f => `
                    <div class="card" style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
                        <img src="${escapeHtml(f.product?.imageUrl || 'image/image 13.png')}" style="width:80px; height:80px; object-fit:cover; border-radius:12px;">
                        <div style="flex:1;"><h4>${escapeHtml(f.product?.name)}</h4><p>${f.product?.price} ₽</p></div>
                        <a href="product.html?id=${f.productId}" class="btn" style="padding:8px 20px;">Посмотреть</a>
                    </div>
                `).join('');
            }
            else if (tab === 'settings') {
                c.innerHTML = `
                    <div class="card">
                        <h3 style="margin-bottom: 24px;">Настройки профиля</h3>
                        <form id="settings-form" class="settings-form">
                            <div class="form-group"><label>Имя</label><input type="text" id="settings-name" value="${escapeHtml(user.FullName || user.fullName || user.name || '')}" placeholder="Ваше имя"></div>
                            <div class="form-group"><label>Email</label><input type="email" id="settings-email" value="${escapeHtml(user.Email || user.email || '')}" readonly disabled style="background:#f5f5f5;"></div>
                            <div class="form-group"><label>Телефон</label><input type="tel" id="settings-phone" value="${escapeHtml(user.phone || '')}" placeholder="+7 (XXX) XXX-XX-XX"></div>
                            <button type="button" class="btn" id="update-profile-btn" style="background: var(--primary); width: 100%; margin-bottom: 16px;">Сохранить изменения</button>
                            <hr style="margin: 20px 0;"><h4 style="margin-bottom: 16px;">Смена пароля</h4>
                            <div class="form-group"><label>Текущий пароль</label><input type="password" id="current-password" placeholder="Введите текущий пароль"></div>
                            <div class="form-group"><label>Новый пароль</label><input type="password" id="new-password" placeholder="Введите новый пароль"></div>
                            <div class="form-group"><label>Подтверждение пароля</label><input type="password" id="confirm-password" placeholder="Подтвердите новый пароль"></div>
                            <button type="button" class="btn" id="change-password-btn" style="background: #ff4757; width: 100%;">Сменить пароль</button>
                        </form>
                    </div>
                `;
                
                document.getElementById('update-profile-btn')?.addEventListener('click', async () => {
                    const newName = document.getElementById('settings-name').value.trim();
                    const phone = document.getElementById('settings-phone').value.trim();
                    if (!newName) { alert('Введите имя'); return; }
                    try {
                        const response = await fetch(`${API_BASE}/users/profile`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fullName: newName, phone: phone })
                        });
                        if (!response.ok) throw new Error(await response.text());
                        const userData = JSON.parse(localStorage.getItem('user') || '{}');
                        userData.FullName = newName; userData.fullName = newName; userData.phone = phone;
                        localStorage.setItem('user', JSON.stringify(userData));
                        alert('Профиль обновлён!');
                        loadDashboard();
                    } catch(e) { alert('Ошибка: ' + e.message); }
                });
                
                document.getElementById('change-password-btn')?.addEventListener('click', async () => {
                    const currentPassword = document.getElementById('current-password').value;
                    const newPassword = document.getElementById('new-password').value;
                    const confirmPassword = document.getElementById('confirm-password').value;
                    if (!currentPassword || !newPassword || !confirmPassword) { alert('Заполните все поля'); return; }
                    if (newPassword !== confirmPassword) { alert('Новый пароль и подтверждение не совпадают'); return; }
                    if (newPassword.length < 6) { alert('Пароль должен содержать не менее 6 символов'); return; }
                    try {
                        const response = await fetch(`${API_BASE}/auth/change-password`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword })
                        });
                        if (!response.ok) throw new Error(await response.text());
                        alert('Пароль успешно изменён!');
                        document.getElementById('current-password').value = '';
                        document.getElementById('new-password').value = '';
                        document.getElementById('confirm-password').value = '';
                    } catch(e) { alert('Ошибка: ' + e.message); }
                });
            }
        } catch(e) { c.innerHTML = `<p style="color:red;text-align:center;padding:20px;">Ошибка: ${e.message}</p>`; }
    }
    
    function getStatusClass(status) {
        const map = { 'Новый': 'new', 'В работе': 'work', 'Готов': 'ready', 'Доставлен': 'delivered' };
        return map[status] || 'new';
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
    }
    
    loadDashboard();
});