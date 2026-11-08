// miecommerce/public/app.js
const API_URL = '/api';
let socket = null;
let currentUser = null;
let currentToken = localStorage.getItem('miecommerce_token') || null;
let currentProductViewId = null;
let pendingCheckoutData = null; // { items: [{ productId, title, unitPrice, quantity }], total }
let selectedPaymentMethod = 'qr';
let cart = [];
let activeChatOrderId = null;
let cachedOrdersMap = {};

try {
  currentUser = JSON.parse(localStorage.getItem('miecommerce_user') || 'null');
  cart = JSON.parse(localStorage.getItem('miecommerce_cart') || '[]');
} catch (e) {
  currentUser = null;
  cart = [];
}

window.addEventListener('DOMContentLoaded', () => {
  renderNavbarUser();
  updateCartBadge();
  initRealtimeSocket();
  loadCarousel();
  loadProducts();
});

// =====================================================
// 1. SOCKET.IO TIEMPO REAL (PREGUNTAS, VENTAS, ENVÍOS, CHAT)
// =====================================================
function initRealtimeSocket() {
  if (typeof io === 'undefined') return;
  socket = io();

  socket.on('connect', () => {
    if (currentUser && currentUser.id) {
      socket.emit('registrar_usuario', currentUser.id);
    }
  });

  socket.on('nueva_pregunta_recibida', (data) => {
    showToast(`💬 Nueva pregunta en "${data.productTitle}": "${data.question.questionText}"`);
  });

  socket.on('pregunta_respondida', (data) => {
    showToast(`✅ Respondieron tu pregunta en "${data.productTitle}": "${data.answerText}"`);
  });

  socket.on('nueva_venta', (data) => {
    showToast(`🎉 ¡Nueva venta! ${data.quantity}x "${data.title}" ($${data.subtotal} en Escrow).`);
  });

  socket.on('fondos_liberados', (data) => {
    showToast(`💰 Entrega confirmada. Se liberaron $${data.amountReleased} a tu saldo disponible.`);
  });

  socket.on('envio_actualizado', (data) => {
    showToast(`🚚 Envío actualizado (${data.carrier}): ${data.stage}. Código: ${data.trackingCode}`);
    if (document.getElementById('view-dashboard').classList.contains('active')) {
      loadUserDashboard();
    }
  });

  socket.on('nuevo_mensaje_orden', (data) => {
    showToast(`📩 Nuevo mensaje privado de ${data.message.senderName}: "${data.message.text}"`);
    if (activeChatOrderId === data.orderId) {
      appendChatMessageToModal(data.message);
    }
    if (document.getElementById('view-dashboard').classList.contains('active')) {
      loadUserDashboard();
    }
  });

  socket.on('actualizar_preguntas_articulo', () => {
    if (currentProductViewId) {
      openProductDetail(currentProductViewId, false);
    }
  });
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

// =====================================================
// 2. NAVEGACIÓN Y CABECERA
// =====================================================
function getAuthHeaders(isFormData = false) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;
  return headers;
}

function renderNavbarUser() {
  const container = document.getElementById('nav-user-area');
  if (!container) return;

  if (currentUser && currentToken) {
    container.innerHTML = `
      <span>Hola, <strong>${currentUser.name}</strong></span>
      <button class="btn-outline" onclick="navigate('dashboard')">Mi Panel / Vender</button>
      <button class="btn-back" style="margin:0; font-weight:600" onclick="logout()">Salir</button>
    `;
  } else {
    container.innerHTML = `
      <button class="btn-primary" onclick="openModal('modal-auth')">Ingresar / Crear cuenta</button>
    `;
  }
}

function navigate(viewName) {
  if (currentProductViewId && viewName !== 'product' && socket) {
    socket.emit('salir_articulo', currentProductViewId);
    currentProductViewId = null;
  }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  if (viewName === 'home') {
    loadCarousel();
    loadProducts();
  } else if (viewName === 'dashboard') {
    loadUserDashboard();
  }
}

// =====================================================
// 3. CARRITO MULTI-PRODUCTO Y FAVORITOS
// =====================================================
function updateCartBadge() {
  const totalQty = cart.reduce((acc, item) => acc + item.quantity, 0);
  const badge = document.getElementById('cart-badge');
  if (badge) badge.textContent = totalQty;
  localStorage.setItem('miecommerce_cart', JSON.stringify(cart));
}

function addToCart(productId, title, unitPrice, maxStock, image) {
  const qtyInput = document.getElementById('buy-quantity');
  const qty = qtyInput ? Number(qtyInput.value || 1) : 1;

  const existing = cart.find(i => i.productId === productId);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + qty, maxStock);
  } else {
    cart.push({ productId, title, unitPrice: Number(unitPrice), quantity: qty, image });
  }

  updateCartBadge();
  showToast(`🛒 "${title}" agregado al carrito.`);
}

function openCartModal() {
  const container = document.getElementById('cart-items-container');
  const totalLabel = document.getElementById('cart-total-label');

  if (cart.length === 0) {
    container.innerHTML = `<p style="color:#666; padding:12px 0">Tu carrito está vacío. ¡Agrega artículos para comprar todo junto!</p>`;
    totalLabel.textContent = 'Total: $0';
  } else {
    const total = cart.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
    totalLabel.textContent = `Total: $ ${total.toLocaleString('es-AR')}`;
    container.innerHTML = cart.map((item, idx) => `
      <div class="qa-item" style="display:flex; justify-content:space-between; align-items:center">
        <div>
          <strong>${item.title}</strong><br/>
          <small>${item.quantity} u. x $${item.unitPrice.toLocaleString('es-AR')} = <strong>$${(item.unitPrice * item.quantity).toLocaleString('es-AR')}</strong></small>
        </div>
        <button class="btn-back" style="margin:0; color:#d32f2f" onclick="removeFromCart(${idx})">Quitar</button>
      </div>
    `).join('');
  }
  openModal('modal-cart');
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartBadge();
  openCartModal();
}

function clearCart() {
  cart = [];
  updateCartBadge();
  openCartModal();
}

function checkoutFromCart() {
  if (!currentToken) {
    closeModal('modal-cart');
    return openModal('modal-auth');
  }
  if (cart.length === 0) return;

  const total = cart.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  pendingCheckoutData = {
    items: cart.map(i => ({ productId: i.productId, title: i.title, unitPrice: i.unitPrice, quantity: i.quantity })),
    total,
    fromCart: true
  };

  closeModal('modal-cart');
  openCheckoutModalWithData();
}

async function toggleFavoriteProduct(productId, event) {
  if (event) event.stopPropagation();
  if (!currentToken) return openModal('modal-auth');

  const res = await fetch(`${API_URL}/users/favorites/${productId}`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (res.ok) {
    currentUser.favorites = data.favorites;
    localStorage.setItem('miecommerce_user', JSON.stringify(currentUser));
    showToast(data.isFavorite ? '❤️ Guardado en tus Favoritos' : '🤍 Quitaste el artículo de Favoritos');
    if (currentProductViewId === productId) openProductDetail(productId, false);
  }
}

// =====================================================
// 4. CARRUSEL Y EXPLORADOR DE ARTÍCULOS
// =====================================================
async function loadCarousel() {
  try {
    const res = await fetch(`${API_URL}/products/carousel`, { headers: getAuthHeaders() });
    const data = await res.json();

    document.getElementById('carousel-title').textContent = data.carouselTitle || 'Destacados';
    const track = document.getElementById('carousel-track');

    if (!data.items || data.items.length === 0) {
      track.innerHTML = `<p style="color:#666">Aún no hay artículos publicados.</p>`;
      return;
    }

    track.innerHTML = data.items.map(prod => renderProductCardHTML(prod)).join('');
  } catch (err) {
    console.error('Error cargando carrusel:', err);
  }
}

function scrollCarousel(direction) {
  const track = document.getElementById('carousel-track');
  track.scrollBy({ left: direction * 460, behavior: 'smooth' });
}

async function loadProducts() {
  try {
    const q = document.getElementById('search-input').value.trim();
    const category = document.getElementById('search-category').value;
    const condition = document.getElementById('filter-condition').value;
    const minPrice = document.getElementById('filter-min-price').value;
    const maxPrice = document.getElementById('filter-max-price').value;
    const sort = document.getElementById('filter-sort').value;

    const params = new URLSearchParams({ sort });
    if (q) params.append('q', q);
    if (category) params.append('category', category);
    if (condition) params.append('condition', condition);
    if (minPrice) params.append('minPrice', minPrice);
    if (maxPrice) params.append('maxPrice', maxPrice);

    const res = await fetch(`${API_URL}/products/search?${params.toString()}`);
    const data = await res.json();

    document.getElementById('results-count').textContent = `${data.total || 0} artículos encontrados`;
    const grid = document.getElementById('products-grid');

    if (!data.products || data.products.length === 0) {
      grid.innerHTML = `<div class="dash-panel" style="grid-column: 1/-1">No se encontraron artículos para estos filtros.</div>`;
      return;
    }

    grid.innerHTML = data.products.map(prod => renderProductCardHTML(prod)).join('');
  } catch (err) {
    console.error('Error en buscador:', err);
  }
}

function renderProductCardHTML(prod) {
  const img = (prod.images && prod.images[0]) || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';
  const stars = prod.ratingSummary?.average ? `⭐ ${prod.ratingSummary.average} (${prod.ratingSummary.count})` : '⭐ Nuevo';
  return `
    <div class="product-card" onclick="openProductDetail('${prod._id}')">
      <img src="${img}" alt="${prod.title}" />
      <div class="product-card-body">
        <div class="product-price">$ ${Number(prod.price).toLocaleString('es-AR')}</div>
        <div class="product-installments">Mismo precio en 6 cuotas de $${Math.round(prod.price / 6).toLocaleString('es-AR')}</div>
        <div class="product-title">${prod.title}</div>
        <div class="product-meta">
          <span>${stars}</span>
          <span>Stock: ${prod.stock} u.</span>
        </div>
      </div>
    </div>
  `;
}

function handleSearch(e) {
  e.preventDefault();
  navigate('home');
}

function quickFilter(category) {
  document.getElementById('search-category').value = category;
  navigate('home');
}

// =====================================================
// 5. DETALLE DEL ARTÍCULO + GALERÍA DE MINIATURAS + Q&A
// =====================================================
async function openProductDetail(productId, changeView = true) {
  try {
    const res = await fetch(`${API_URL}/products/${productId}`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Error cargando producto');

    const { product, questions, reviews } = data;
    currentProductViewId = product._id;
    if (socket) socket.emit('viendo_articulo', product._id);

    if (changeView) navigate('product');

    const images = (product.images && product.images.length > 0)
      ? product.images
      : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800'];
    const dist = product.ratingSummary?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const totalRev = product.ratingSummary?.count || 0;
    const safeTitle = product.title.replace(/'/g, '');
    const isFav = currentUser?.favorites?.includes(product._id);

    document.getElementById('product-detail-container').innerHTML = `
      <div class="detail-top-grid">
        <div>
          <img id="main-product-img" class="detail-main-img" src="${images[0]}" alt="${product.title}" />
          ${images.length > 1 ? `
            <div style="display:flex; gap:10px; margin-top:10px; overflow-x:auto">
              ${images.map(imgUrl => `
                <img src="${imgUrl}" onclick="document.getElementById('main-product-img').src='${imgUrl}'"
                     style="width:68px; height:68px; object-fit:cover; border-radius:6px; border:2px solid #ddd; cursor:pointer" />
              `).join('')}
            </div>
          ` : ''}
          <h3 style="margin-top:20px">Descripción del artículo</h3>
          <p style="margin-top:10px; color:#555; line-height:1.6">${product.description}</p>
        </div>

        <div class="buy-box">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <span class="condition-badge">${product.condition.toUpperCase()} | +${product.soldCount} vendidos</span>
            <button class="btn-outline" style="padding:5px 10px" onclick="toggleFavoriteProduct('${product._id}', event)">
              ${isFav ? '❤️ En Favoritos' : '🤍 Favorito'}
            </button>
          </div>
          <h2 style="margin-top:6px">${product.title}</h2>
          <div style="margin-top:6px; color:#3483fa; font-weight:600">
            ⭐ ${product.ratingSummary?.average || 'Sin calificaciones'} (${totalRev} opiniones de satisfacción)
          </div>
          <div class="detail-price">$ ${Number(product.price).toLocaleString('es-AR')}</div>
          <div class="product-installments">Pagá con QR, Tarjeta o tu Saldo de Billetera</div>

          <div class="stock-box">
            <strong>Stock disponible:</strong> ${product.stock} unidades registradas<br/>
            <label style="display:block; margin-top:8px">Cantidad:</label>
            <input type="number" id="buy-quantity" value="1" min="1" max="${product.stock}" style="width:90px; padding:6px; margin-top:4px" />
          </div>

          <button class="btn-primary full-width" style="margin-bottom:8px" onclick="startSingleCheckout('${product._id}', '${safeTitle}', ${product.price})">
            Comprar ahora
          </button>
          <button class="btn-outline full-width" onclick="addToCart('${product._id}', '${safeTitle}', ${product.price}, ${product.stock}, '${images[0]}')">
            🛒 Agregar al carrito
          </button>

          <div style="font-size:0.82rem; color:#666; margin-top:14px">
            🛡️ <strong>Compra Protegida con Escrow:</strong> Tu dinero se retiene y solo se libera a <strong>${product.seller?.name || 'el vendedor'}</strong> cuando confirmás que recibiste el paquete.
          </div>
        </div>
      </div>

      <!-- PREGUNTAS Y RESPUESTAS -->
      <div class="qa-section">
        <h3>Preguntas y respuestas sobre este artículo</h3>
        <form onsubmit="submitQuestion(event, '${product._id}')" style="display:flex; gap:10px; margin: 14px 0 20px">
          <input type="text" id="question-input" required placeholder="Escribí tu pregunta para el vendedor..." style="flex:1; padding:10px; border:1px solid #ccc; border-radius:6px" />
          <button type="submit" class="btn-primary">Preguntar</button>
        </form>
        <div id="qa-list">
          ${questions.length === 0 ? '<p style="color:#666">Nadie hizo preguntas todavía. ¡Sé el primero!</p>' : questions.map(q => `
            <div class="qa-item">
              <div class="qa-q">💬 ${q.questionText} <span style="font-weight:400; font-size:0.78rem; color:#888">por ${q.buyer?.name || 'Usuario'}</span></div>
              ${q.answerText
                ? `<div class="qa-a">↳ ${q.answerText}</div>`
                : `<div style="font-size:0.82rem; color:#e65100">⏳ Pendiente de respuesta del vendedor</div>`
              }
            </div>
          `).join('')}
        </div>
      </div>

      <!-- SATISFACCIÓN -->
      <div class="reviews-section">
        <h3>Opiniones y Nivel de Satisfacción del Producto</h3>
        <div class="rating-overview">
          <div>
            <div class="rating-big-number">${product.ratingSummary?.average || '0.0'}</div>
            <div style="color:#666; font-size:0.85rem">${totalRev} calificaciones verificadas</div>
          </div>
          <div class="rating-bars">
            ${[5, 4, 3, 2, 1].map(star => {
              const count = dist[star] || 0;
              const pct = totalRev > 0 ? Math.round((count / totalRev) * 100) : 0;
              return `
                <div class="bar-row">
                  <span>${star} ★</span>
                  <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
                  <span>${count}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div>
          ${reviews.length === 0 ? '<p style="color:#666">Este artículo aún no tiene reseñas de compradores.</p>' : reviews.map(r => `
            <div class="qa-item">
              <div style="color:#ffb400; font-weight:bold">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} <span style="color:#333">${r.buyer?.name || 'Comprador verificado'}</span></div>
              <p style="margin-top:4px">${r.comment || 'Excelente producto.'}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error abriendo producto:', err);
  }
}

async function submitQuestion(e, productId) {
  e.preventDefault();
  if (!currentToken) return openModal('modal-auth');

  const questionText = document.getElementById('question-input').value.trim();
  const res = await fetch(`${API_URL}/questions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ productId, questionText })
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);

  document.getElementById('question-input').value = '';
  openProductDetail(productId, false);
}

// =====================================================
// 6. CHECKOUT (QR, TARJETA O SALDO DE BILLETERA)
// =====================================================
function startSingleCheckout(productId, title, unitPrice) {
  if (!currentToken) return openModal('modal-auth');

  const quantity = Number(document.getElementById('buy-quantity').value || 1);
  pendingCheckoutData = {
    items: [{ productId, title, unitPrice: Number(unitPrice), quantity }],
    total: Number(unitPrice) * quantity,
    fromCart: false
  };

  openCheckoutModalWithData();
}

function openCheckoutModalWithData() {
  const summaryItems = pendingCheckoutData.items.map(i => `${i.quantity}x "${i.title}"`).join(' + ');
  document.getElementById('checkout-summary-text').textContent =
    `Estás comprando ${summaryItems} por un total de $ ${pendingCheckoutData.total.toLocaleString('es-AR')}`;

  const qrPayload = encodeURIComponent(`MIE-CHECKOUT|ARS:${pendingCheckoutData.total}|ITEMS:${pendingCheckoutData.items.length}`);
  document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${qrPayload}`;
  document.getElementById('qr-order-ref').textContent = `Total a abonar: $${pendingCheckoutData.total.toLocaleString('es-AR')}`;

  openModal('modal-checkout');
}

function selectPaymentTab(method) {
  selectedPaymentMethod = method;
  document.getElementById('pay-tab-qr').classList.toggle('active', method === 'qr');
  document.getElementById('pay-tab-card').classList.toggle('active', method === 'credit_card');
  document.getElementById('pay-tab-wallet').classList.toggle('active', method === 'wallet');

  document.getElementById('payment-panel-qr').classList.toggle('hidden', method !== 'qr');
  document.getElementById('payment-panel-card').classList.toggle('hidden', method !== 'credit_card');
  document.getElementById('payment-panel-wallet').classList.toggle('hidden', method !== 'wallet');
}

function updateCardPreview() {
  const num = document.getElementById('card-number').value || '•••• •••• •••• 4242';
  const name = document.getElementById('card-holder').value.toUpperCase() || 'NOMBRE Y APELLIDO';
  const exp = document.getElementById('card-expiry').value || '12/28';
  document.getElementById('cc-preview-num').textContent = num;
  document.getElementById('cc-preview-name').textContent = name;
  document.getElementById('cc-preview-exp').textContent = exp;
}

async function confirmElectronicPayment() {
  if (!pendingCheckoutData) return;

  const street = document.getElementById('ship-street').value.trim();
  const city = document.getElementById('ship-city').value.trim();
  const state = document.getElementById('ship-state').value.trim();
  const zipCode = document.getElementById('ship-zip').value.trim();
  const carrier = document.getElementById('ship-carrier').value;

  if (!street || !city || !state || !zipCode) {
    return alert('Por favor completa la dirección de envío.');
  }

  const orderRes = await fetch(`${API_URL}/orders/checkout`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      items: pendingCheckoutData.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod: selectedPaymentMethod,
      shipping: { carrier, street, city, state, zipCode }
    })
  });

  const orderData = await orderRes.json();
  if (!orderRes.ok) return alert(orderData.error || 'Error al crear la orden');

  if (pendingCheckoutData.fromCart) {
    cart = [];
    updateCartBadge();
  }

  // Si pagó con saldo de billetera, ya quedó acreditado en el acto
  if (orderData.paidWithWallet) {
    closeModal('modal-checkout');
    showToast(`💰 Pago con Saldo de Billetera exitoso. Orden enviada al vendedor.`);
    return navigate('dashboard');
  }

  // Si eligió QR o Tarjeta, acredita en el webhook
  const payRes = await fetch(`${API_URL}/webhooks/mercadopago`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      orderId: orderData.orderId,
      paymentId: `ELECTRONIC-${selectedPaymentMethod.toUpperCase()}-${Date.now()}`
    })
  });

  if (payRes.ok) {
    closeModal('modal-checkout');
    showToast(`✅ Pago acreditado. El vendedor ya puede imprimir la etiqueta de ${carrier}.`);
    navigate('dashboard');
  } else {
    alert('Error al procesar el pago electrónico');
  }
}

// =====================================================
// 7. PANEL DE USUARIO (BILLETERA, MULTER, ETIQUETA, CHAT)
// =====================================================
async function loadUserDashboard() {
  if (!currentToken) return openModal('modal-auth');

  const res = await fetch(`${API_URL}/panel/dashboard`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) return;

  const { profile, myProducts, myPurchases, mySales, pendingQuestions } = data;

  // Guardar órdenes en memoria para abrir el Chat o imprimir etiqueta fácilmente
  cachedOrdersMap = {};
  [...myPurchases, ...mySales].forEach(o => { cachedOrdersMap[o._id] = o; });

  document.getElementById('dashboard-container').innerHTML = `
    <h2 style="margin-bottom:16px">Panel de Control de ${profile.name}</h2>

    <!-- BILLETERA ESCROW + RETIRO POR CBU / ALIAS -->
    <div class="wallet-banner">
      <div class="wallet-card escrow">
        <div>🔒 Dinero en Retención (Escrow - Compra Protegida)</div>
        <div class="wallet-amount">$ ${(profile.wallet?.pendingBalance || 0).toLocaleString('es-AR')}</div>
        <small style="color:#666">Se libera cuando tus compradores confirman que recibieron el paquete</small>
      </div>
      <div class="wallet-card available">
        <div>💰 Saldo Disponible en Billetera</div>
        <div class="wallet-amount">$ ${(profile.wallet?.availableBalance || 0).toLocaleString('es-AR')}</div>
        <form onsubmit="handleWithdrawFunds(event)" style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap">
          <input type="number" id="withdraw-amount" required min="1" placeholder="Monto $" style="width:110px; padding:6px; border:1px solid #ccc; border-radius:4px" />
          <input type="text" id="withdraw-cbu" required placeholder="Tu CBU o Alias bancario..." style="flex:1; padding:6px; border:1px solid #ccc; border-radius:4px" />
          <button type="submit" class="btn-success" style="padding:6px 12px">Retirar a mi CBU</button>
        </form>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- PUBLICAR ARTÍCULO CON SUBIDA DE FOTOS DESDE LA PC (MULTER) -->
      <div class="dash-panel">
        <h3>📦 Publicar un Nuevo Artículo</h3>
        <form onsubmit="handleCreateProduct(event)" style="margin-top:12px">
          <div class="form-group">
            <label>Título del artículo</label>
            <input type="text" id="prod-title" required placeholder="Ej: Notebook Gamer 16GB RAM SSD" />
          </div>
          <div class="form-row" style="grid-template-columns: 1fr 1fr">
            <div class="form-group">
              <label>Categoría</label>
              <select id="prod-category">
                <option value="Tecnología">Tecnología</option>
                <option value="Electrodomésticos">Electrodomésticos</option>
                <option value="Hogar y Muebles">Hogar y Muebles</option>
                <option value="Herramientas">Herramientas</option>
                <option value="Vehículos y Accesorios">Vehículos y Accesorios</option>
                <option value="Deportes">Deportes</option>
              </select>
            </div>
            <div class="form-group">
              <label>Condición</label>
              <select id="prod-condition">
                <option value="nuevo">Nuevo</option>
                <option value="usado">Usado</option>
                <option value="reacondicionado">Reacondicionado</option>
              </select>
            </div>
          </div>
          <div class="form-row" style="grid-template-columns: 1fr 1fr">
            <div class="form-group">
              <label>Precio ($ ARS)</label>
              <input type="number" id="prod-price" required min="1" placeholder="150000" />
            </div>
            <div class="form-group">
              <label>Unidades en Stock</label>
              <input type="number" id="prod-stock" required min="1" placeholder="10" />
            </div>
          </div>
          <div class="form-group">
            <label>📸 Subir fotos desde tu PC (Hasta 5 imágenes)</label>
            <input type="file" id="prod-files" multiple accept="image/*" />
          </div>
          <div class="form-group">
            <label>O pegar URL de Imagen (Opcional)</label>
            <input type="url" id="prod-image" placeholder="https://images.unsplash.com/..." />
          </div>
          <div class="form-group">
            <label>Descripción detallada</label>
            <textarea id="prod-desc" rows="3" required placeholder="Especificaciones, garantía y detalles..."></textarea>
          </div>
          <button type="submit" class="btn-primary full-width">Publicar Artículo Ahora</button>
        </form>
      </div>

      <!-- PREGUNTAS PENDIENTES, STOCK Y FAVORITOS -->
      <div class="dash-panel">
        <h3>💬 Preguntas Pendientes (${pendingQuestions.length})</h3>
        <div style="margin-top:10px">
          ${pendingQuestions.length === 0 ? '<p style="color:#666">¡Al día! No tienes preguntas sin responder.</p>' : pendingQuestions.map(q => `
            <div class="qa-item">
              <div style="font-size:0.8rem; color:#3483fa; font-weight:600">${q.product?.title || 'Artículo'}</div>
              <div class="qa-q">${q.questionText}</div>
              <div style="display:flex; gap:8px; margin-top:8px">
                <input type="text" id="ans-${q._id}" placeholder="Escribe tu respuesta..." style="flex:1; padding:6px" />
                <button class="btn-primary" onclick="submitAnswer('${q._id}')">Responder</button>
              </div>
            </div>
          `).join('')}
        </div>

        <h3 style="margin-top:20px">🏷️ Mis Artículos Publicados (${myProducts.length})</h3>
        <div style="margin-top:10px; max-height:220px; overflow-y:auto">
          ${myProducts.map(p => `
            <div class="qa-item" style="display:flex; justify-content:space-between; align-items:center">
              <div>
                <strong>${p.title}</strong> ($${p.price.toLocaleString('es-AR')})<br/>
                <small>Estado: ${p.status} | Vendidos: ${p.soldCount}</small>
              </div>
              <div style="display:flex; align-items:center; gap:6px">
                <input type="number" id="stk-${p._id}" value="${p.stock}" min="0" style="width:65px; padding:5px" />
                <button class="btn-outline" onclick="updateStock('${p._id}')">Guardar</button>
              </div>
            </div>
          `).join('')}
        </div>

        <h3 style="margin-top:20px">❤️ Mis Favoritos Guardados (${(profile.favorites || []).length})</h3>
        <div style="margin-top:10px">
          ${(!profile.favorites || profile.favorites.length === 0) ? '<p style="color:#666">Aún no guardaste favoritos.</p>' : profile.favorites.map(fav => `
            <div class="qa-item" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer" onclick="openProductDetail('${fav._id}')">
              <span><strong>${fav.title}</strong> - $${Number(fav.price).toLocaleString('es-AR')}</span>
              <span style="color:#3483fa; font-weight:600">Ver &rarr;</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- MIS VENTAS + IMPRIMIR ETIQUETA DE CORREO + CHAT PRIVADO -->
    <div class="dash-panel">
      <h3>🚚 Mis Ventas y Gestión de Envíos (${mySales.length})</h3>
      <div style="margin-top:12px">
        ${mySales.length === 0 ? '<p style="color:#666">Aún no tienes ventas registradas.</p>' : mySales.map(sale => {
          const ship = sale.shipping || {};
          const addr = ship.address || {};
          const procedure = getCarrierProcedure(ship.carrier);
          return `
            <div class="qa-item" style="border-left: 4px solid #2d3277; margin-bottom:14px">
              <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px">
                <div>
                  <strong>Venta #${sale._id}</strong> | Comprador: <strong>${sale.buyer?.name || 'Cliente'}</strong> (${sale.buyer?.email || ''})<br/>
                  <span>Artículos: ${sale.items.map(i => `${i.quantity}x ${i.title}`).join(', ')}</span>
                </div>
                <div style="display:flex; gap:8px; align-items:center">
                  <button class="btn-outline" onclick="printShippingLabel('${sale._id}')">🖨️ Imprimir Etiqueta de Correo</button>
                  <button class="btn-primary" onclick="openOrderChat('${sale._id}')">💬 Chat con Comprador (${(sale.messages || []).length})</button>
                </div>
              </div>

              <div style="background:#fff; border:1px solid #ddd; border-radius:6px; padding:12px; margin-top:10px; font-size:0.88rem">
                <div>📍 <strong>Destino (${ship.carrier || 'Correo Argentino'}):</strong> ${addr.street || '-'}, ${addr.city || '-'}, ${addr.state || '-'} (CP: ${addr.zipCode || '-'})</div>
                <div style="margin-top:8px; color:#444">
                  📋 <strong>Procedimiento del vendedor para ${ship.carrier || 'Correo Argentino'}:</strong>
                  <ol style="margin:6px 0 0 20px; line-height:1.5">
                    ${procedure.map(step => `<li>${step}</li>`).join('')}
                  </ol>
                </div>

                ${!ship.trackingCode ? `
                  <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; align-items:center">
                    <select id="carrier-${sale._id}" style="padding:7px; border-radius:4px; border:1px solid #ccc">
                      <option value="Correo Argentino" ${ship.carrier === 'Correo Argentino' ? 'selected' : ''}>Correo Argentino</option>
                      <option value="Andreani" ${ship.carrier === 'Andreani' ? 'selected' : ''}>Andreani</option>
                      <option value="OCA" ${ship.carrier === 'OCA' ? 'selected' : ''}>OCA</option>
                    </select>
                    <input type="text" id="trk-${sale._id}" placeholder="Ingresar código de guía o dejar vacío para autogenerar..." style="flex:1; padding:7px; border:1px solid #ccc; border-radius:4px" />
                    <button class="btn-primary" onclick="dispatchSaleOrder('${sale._id}')">
                      📦 Confirmar Despacho y Enviar Código
                    </button>
                  </div>
                ` : `
                  <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#e8f5e9; padding:10px; border-radius:6px">
                    <div>
                      ✅ <strong>Código de Seguimiento activo:</strong>
                      <code style="font-size:1rem; font-weight:700; color:#1b5e20">${ship.trackingCode}</code>
                    </div>
                    ${sale.status !== 'entregado_fondos_liberados' ? `
                      <div style="display:flex; gap:6px">
                        <button class="btn-outline" onclick="advanceShipping('${sale._id}', 'en_transito')">Marcar "En Tránsito"</button>
                        <button class="btn-outline" onclick="advanceShipping('${sale._id}', 'en_distribucion')">Marcar "En Distribución"</button>
                      </div>
                    ` : '<span style="color:#1b5e20; font-weight:700">🎉 Paquete entregado</span>'}
                  </div>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- MIS COMPRAS + SEGUIMIENTO + CHAT PRIVADO -->
    <div class="dash-panel">
      <h3>🛍️ Mis Compras Realizadas y Seguimiento de Envío (${myPurchases.length})</h3>
      <div style="margin-top:12px">
        ${myPurchases.length === 0 ? '<p style="color:#666">Aún no realizaste compras.</p>' : myPurchases.map(ord => {
          const ship = ord.shipping || {};
          const addr = ship.address || {};
          return `
          <div class="qa-item" style="margin-bottom:14px">
            <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px">
              <div>
                <strong>Orden #${ord._id}</strong> - Estado: <span style="color:#3483fa; font-weight:700">${ord.status}</span><br/>
                <span>Artículos: ${ord.items.map(i => `${i.quantity}x ${i.title}`).join(', ')} | Total: <strong>$${ord.totalAmount.toLocaleString('es-AR')}</strong></span>
              </div>
              <div style="display:flex; gap:8px; align-items:center">
                <button class="btn-outline" onclick="openOrderChat('${ord._id}')">💬 Mensajes con el Vendedor (${(ord.messages || []).length})</button>
                ${(ord.status === 'pagado_en_escrow' || ord.status === 'en_camino') ? `
                  <button class="btn-success" onclick="confirmOrderDelivery('${ord._id}')">
                    ✅ Confirmar que recibí el paquete
                  </button>
                ` : ''}
              </div>
            </div>

            <div style="background:#fff; border:1px solid #dce6f7; border-radius:6px; padding:12px; margin-top:10px; font-size:0.88rem">
              <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px">
                <span>🚚 <strong>Empresa de correo:</strong> ${ship.carrier || 'Correo Argentino'}</span>
                <span>📍 <strong>Entrega en:</strong> ${addr.street || ''}, ${addr.city || ''} (CP ${addr.zipCode || ''})</span>
              </div>

              ${ship.trackingCode ? `
                <div style="margin-top:8px; padding:8px 12px; background:#e3edfb; border-radius:6px; display:flex; justify-content:space-between; align-items:center">
                  <span>🔎 <strong>Tu Código de Seguimiento:</strong> <code style="font-size:1.05rem; font-weight:800; color:#2d3277">${ship.trackingCode}</code></span>
                  <span style="font-weight:700; color:#00a650">${(ship.shippingStatus || '').replace('_', ' ').toUpperCase()}</span>
                </div>
              ` : `
                <div style="margin-top:8px; color:#e65100">
                  ⏳ El vendedor está preparando tu paquete en ${ship.carrier || 'Correo Argentino'}. Recibirás el código aquí apenas lo despache.
                </div>
              `}

              ${ship.history && ship.history.length > 0 ? `
                <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #ddd; font-size:0.8rem; color:#555">
                  <strong>Historial de movimientos del paquete:</strong>
                  <ul style="margin:4px 0 0 18px">
                    ${ship.history.map(h => `<li><strong>${h.stage}:</strong> ${h.description}</li>`).join('')}
                  </ul>
                </div>
              ` : ''}
            </div>

            ${ord.canReview ? `
              <div style="margin-top:12px; padding-top:10px; border-top:1px dashed #ccc; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
                <span>Valorar satisfacción:</span>
                <select id="rate-${ord._id}" style="padding:6px">
                  <option value="5">⭐⭐⭐⭐⭐ (5 - Excelente)</option>
                  <option value="4">⭐⭐⭐⭐ (4 - Muy bueno)</option>
                  <option value="3">⭐⭐⭐ (3 - Regular)</option>
                  <option value="2">⭐⭐ (2 - Malo)</option>
                  <option value="1">⭐ (1 - Pésimo)</option>
                </select>
                <input type="text" id="comm-${ord._id}" placeholder="Contanos qué te pareció el producto y el envío..." style="flex:1; padding:6px" />
                <button class="btn-primary" onclick="submitProductReview('${ord._id}', '${ord.items[0]?.product?._id || ord.items[0]?.product}')">
                  Enviar Calificación
                </button>
              </div>
            ` : ''}
          </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// Publicar artículo con FormData (soporta fotos desde la PC con Multer + URL)
async function handleCreateProduct(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('title', document.getElementById('prod-title').value);
  formData.append('category', document.getElementById('prod-category').value);
  formData.append('condition', document.getElementById('prod-condition').value);
  formData.append('price', document.getElementById('prod-price').value);
  formData.append('stock', document.getElementById('prod-stock').value);
  formData.append('imageUrl', document.getElementById('prod-image').value);
  formData.append('description', document.getElementById('prod-desc').value);

  const fileInput = document.getElementById('prod-files');
  if (fileInput && fileInput.files.length > 0) {
    for (let i = 0; i < fileInput.files.length; i++) {
      formData.append('photos', fileInput.files[i]);
    }
  }

  const res = await fetch(`${API_URL}/products`, {
    method: 'POST',
    headers: getAuthHeaders(true),
    body: formData
  });

  if (res.ok) {
    showToast('🚀 ¡Artículo publicado con sus imágenes exitosamente!');
    loadUserDashboard();
  } else {
    alert('Error al publicar el artículo');
  }
}

async function handleWithdrawFunds(e) {
  e.preventDefault();
  const amount = document.getElementById('withdraw-amount').value;
  const cbuOrAlias = document.getElementById('withdraw-cbu').value;

  const res = await fetch(`${API_URL}/wallet/withdraw`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ amount, cbuOrAlias })
  });
  const data = await res.json();
  if (res.ok) {
    showToast(`🏦 ${data.message}`);
    loadUserDashboard();
  } else {
    alert(data.error);
  }
}

// =====================================================
// 8. CHAT PRIVADO POST-VENTA Y ETIQUETA IMPRIMIBLE
// =====================================================
function openOrderChat(orderId) {
  activeChatOrderId = orderId;
  const order = cachedOrdersMap[orderId];
  document.getElementById('chat-modal-title').textContent = `💬 Chat Privado - Orden #${orderId.slice(-6)}`;
  const box = document.getElementById('chat-messages-box');
  box.innerHTML = '';

  const messages = (order && order.messages) || [];
  if (messages.length === 0) {
    box.innerHTML = `<p style="color:#777; text-align:center; margin-top:40px">Inicia la conversación con la otra parte para coordinar detalles del envío o facturación.</p>`;
  } else {
    messages.forEach(m => appendChatMessageToModal(m));
  }

  openModal('modal-chat');
}

function appendChatMessageToModal(msg) {
  const box = document.getElementById('chat-messages-box');
  if (!box) return;
  const isMe = currentUser && msg.sender === currentUser.id;
  const div = document.createElement('div');
  div.style.cssText = `
    align-self: ${isMe ? 'flex-end' : 'flex-start'};
    background: ${isMe ? '#dcf8c6' : '#fff'};
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 78%;
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    font-size: 0.88rem;
  `;
  div.innerHTML = `<strong>${msg.senderName}:</strong><br/>${msg.text}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function submitOrderChatMessage(e) {
  e.preventDefault();
  if (!activeChatOrderId) return;
  const input = document.getElementById('chat-input-text');
  const text = input.value.trim();
  if (!text) return;

  const res = await fetch(`${API_URL}/orders/${activeChatOrderId}/messages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ text })
  });
  const data = await res.json();
  if (res.ok) {
    input.value = '';
    cachedOrdersMap[activeChatOrderId].messages = data.messages;
    openOrderChat(activeChatOrderId);
  }
}

// Generador de Etiqueta Oficial Imprimible con QR y Código de Barras
function printShippingLabel(orderId) {
  const sale = cachedOrdersMap[orderId];
  if (!sale) return;

  const ship = sale.shipping || {};
  const addr = ship.address || {};
  const tracking = ship.trackingCode || `PRE-${orderId.slice(-8).toUpperCase()}-AR`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(tracking)}`;

  const win = window.open('', '_blank', 'width=720,height=850');
  win.document.write(`
    <html>
    <head>
      <title>Etiqueta de Envío - ${tracking}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
        .label-box { border: 3px solid #000; padding: 20px; max-width: 580px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; }
        .carrier { font-size: 24px; font-weight: 900; text-transform: uppercase; }
        .cp-huge { font-size: 36px; font-weight: 900; background: #000; color: #fff; padding: 6px 14px; }
        .section { border-bottom: 1px solid #000; padding: 14px 0; }
        .barcode { font-family: "Courier New", monospace; font-size: 26px; letter-spacing: 6px; font-weight: bold; text-align: center; margin-top: 14px; }
        .bars { height: 55px; background: repeating-linear-gradient(90deg, #000, #000 3px, #fff 3px, #fff 7px); margin: 12px 0; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="label-box">
        <div class="header">
          <div>
            <div class="carrier">${ship.carrier || 'Correo Argentino'}</div>
            <small>miecommerce Logística - Compra Protegida</small>
          </div>
          <div class="cp-huge">CP ${addr.zipCode || '3300'}</div>
        </div>
        <div class="section" style="display:flex; justify-content:space-between; align-items:center">
          <div>
            <strong>DESTINATARIO:</strong><br/>
            <span style="font-size:18px; font-weight:bold">${sale.buyer?.name || 'Comprador Verificado'}</span><br/>
            Dirección: ${addr.street || '-'}<br/>
            Localidad: ${addr.city || '-'} (${addr.state || '-'})<br/>
            Orden Ref: #${sale._id}
          </div>
          <img src="${qrUrl}" width="120" height="120" />
        </div>
        <div class="section">
          <strong>CONTENIDO DEL PAQUETE:</strong><br/>
          ${sale.items.map(i => `${i.quantity}x ${i.title}`).join('<br/>')}
        </div>
        <div class="bars"></div>
        <div class="barcode">* ${tracking} *</div>
      </div>
    </body>
    </html>
  `);
  win.document.close();
}

async function updateStock(productId) {
  const stock = Number(document.getElementById(`stk-${productId}`).value);
  const res = await fetch(`${API_URL}/products/${productId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ stock })
  });
  if (res.ok) {
    showToast('📦 Unidades de stock actualizadas');
    loadUserDashboard();
  }
}

async function submitAnswer(questionId) {
  const answerText = document.getElementById(`ans-${questionId}`).value.trim();
  if (!answerText) return;

  const res = await fetch(`${API_URL}/questions/${questionId}/answer`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ answerText })
  });
  if (res.ok) {
    showToast('✅ Respuesta enviada al comprador en tiempo real');
    loadUserDashboard();
  }
}

async function confirmOrderDelivery(orderId) {
  const res = await fetch(`${API_URL}/orders/${orderId}/confirm-delivery`, {
    method: 'PATCH',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (res.ok) {
    showToast('🎉 Entrega confirmada. ¡Ahora puedes calificar el producto de 1 a 5 estrellas!');
    loadUserDashboard();
  } else {
    alert(data.error);
  }
}

async function submitProductReview(orderId, productId) {
  const rating = Number(document.getElementById(`rate-${orderId}`).value);
  const comment = document.getElementById(`comm-${orderId}`).value;

  const res = await fetch(`${API_URL}/reviews`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ orderId, productId, rating, comment })
  });
  const data = await res.json();
  if (res.ok) {
    showToast('⭐ ¡Gracias! Tu valoración ya es visible en la página del artículo.');
  } else {
    alert(data.error);
  }
}

// =====================================================
// 9. AUTENTICACIÓN Y LOGÍSTICA
// =====================================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('form-login').classList.toggle('hidden', !isLogin);
  document.getElementById('form-register').classList.toggle('hidden', isLogin);
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);

  saveSession(data.token, data.user);
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);

  saveSession(data.token, data.user);
}

function saveSession(token, user) {
  currentToken = token;
  currentUser = user;
  localStorage.setItem('miecommerce_token', token);
  localStorage.setItem('miecommerce_user', JSON.stringify(user));
  if (socket) socket.emit('registrar_usuario', user.id);
  closeModal('modal-auth');
  renderNavbarUser();
  loadCarousel();
}

function logout() {
  localStorage.removeItem('miecommerce_token');
  localStorage.removeItem('miecommerce_user');
  currentToken = null;
  currentUser = null;
  renderNavbarUser();
  navigate('home');
}

function getCarrierProcedure(carrier) {
  if (carrier === 'Andreani') {
    return [
      'Embala el artículo en caja rígida con pluribol y pega la etiqueta Andreani.',
      'Acércate a la sucursal Andreani o Punto HOP más cercano con tu DNI.',
      'Solicita el escaneo del código QR/barras y carga aquí el número de guía entregado.'
    ];
  }
  if (carrier === 'OCA') {
    return [
      'Coloca el producto en bolsa de seguridad o caja encintada con la etiqueta impresa.',
      'Preséntate en el Centro de Imposición OCA habilitado para despachos e-Pak.',
      'Retira el comprobante físico sellado e ingresa el código de seguimiento OCA.'
    ];
  }
  return [
    'Envuelve el producto en papel madera o film negro y adhiere la etiqueta imprimible de Correo Argentino.',
    'Entrega el paquete en el mostrador de Paquetería e-Commerce de cualquier sucursal.',
    'Conserva el ticket con el código Track & Trace (CA-XXXXXXXX-AR) y regístralo abajo.'
  ];
}

async function dispatchSaleOrder(orderId) {
  const carrier = document.getElementById(`carrier-${orderId}`).value;
  const trackingCode = document.getElementById(`trk-${orderId}`).value;

  const res = await fetch(`${API_URL}/orders/${orderId}/dispatch`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ carrier, trackingCode })
  });
  const data = await res.json();
  if (res.ok) {
    showToast(`📦 Paquete despachado. Código ${data.order.shipping.trackingCode} enviado al comprador.`);
    loadUserDashboard();
  } else {
    alert(data.error);
  }
}

async function advanceShipping(orderId, shippingStatus) {
  const res = await fetch(`${API_URL}/orders/${orderId}/shipping-stage`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ shippingStatus })
  });
  if (res.ok) {
    showToast('🚚 Estado logístico actualizado y notificado al comprador.');
    loadUserDashboard();
  }
}