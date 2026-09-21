const state = { token: sessionStorage.getItem('orderflow-token'), user: JSON.parse(sessionStorage.getItem('orderflow-user') || 'null'), products: [], cart: new Map() };
const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('en-TR', { style: 'currency', currency: 'TRY' }).format(cents / 100);

// Every API call shares token handling and one place for readable error messages.
async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers };
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Request failed (${response.status})`);
  return data;
}

function notify(message, error = false) {
  const box = $('notice');
  box.textContent = message;
  box.classList.toggle('error', error);
  box.hidden = false;
}

function renderSession() {
  $('login-panel').hidden = !!state.user;
  $('workspace').hidden = !state.user;
  $('logout').hidden = !state.user;
  $('current-user').textContent = state.user ? `${state.user.displayName} · ${state.user.role}` : 'Not signed in';
  document.querySelector('.cart-panel').hidden = state.user?.role === 'admin';
}

function renderProducts() {
  const root = $('products');
  root.replaceChildren();
  for (const product of state.products) {
    const card = document.createElement('article');
    card.className = 'product';
    const title = document.createElement('h4'); title.textContent = product.name;
    const stock = document.createElement('span'); stock.className = 'stock'; stock.textContent = `${product.stock} in stock`;
    const bottom = document.createElement('div'); bottom.className = 'bottom';
    const price = document.createElement('strong'); price.textContent = money(product.priceCents);
    const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Add to cart'; add.disabled = product.stock < 1 || state.user?.role === 'admin';
    add.setAttribute('aria-label', `Add ${product.name} to cart`);
    add.addEventListener('click', () => {
      const quantity = (state.cart.get(product.id) || 0) + 1;
      if (quantity > product.stock) return notify('No more stock available for this product.', true);
      state.cart.set(product.id, quantity); renderCart();
    });
    bottom.append(price, add); card.append(title, stock, bottom); root.append(card);
  }
}

function renderCart() {
  const root = $('cart-items'); root.replaceChildren();
  let total = 0;
  for (const [id, quantity] of state.cart) {
    const product = state.products.find(item => item.id === id);
    if (!product) continue;
    total += product.priceCents * quantity;
    const row = document.createElement('div'); row.className = 'cart-row';
    const label = document.createElement('span'); label.textContent = `${quantity} × ${product.name}`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${product.name}`);
    remove.addEventListener('click', () => { state.cart.delete(id); renderCart(); });
    row.append(label, remove); root.append(row);
  }
  if (state.cart.size === 0) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'Nothing in your cart yet.'; root.append(empty); }
  // This total is a preview; the server recalculates prices from PostgreSQL.
  $('cart-total').textContent = money(total);
  $('place-order').disabled = state.cart.size === 0;
}

// Buttons reflect order state, but the API still enforces roles and transitions.
function renderOrders(orders) {
  const root = $('orders'); root.replaceChildren();
  if (orders.length === 0) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No orders yet.'; root.append(empty); return; }
  for (const order of orders) {
    const card = document.createElement('article'); card.className = 'order'; card.setAttribute('data-order-id', String(order.id));
    const top = document.createElement('div'); top.className = 'order-top';
    const title = document.createElement('h4'); title.textContent = `Order #${order.id}`;
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = order.status.replaceAll('_', ' ');
    top.append(title, badge);
    const meta = document.createElement('p'); meta.className = 'order-meta';
    meta.textContent = `${order.items.map(item => `${item.quantity} × ${item.name}`).join(', ')} · ${money(order.totalCents)} · ${new Date(order.createdAt).toLocaleString()}`;
    const ledger = document.createElement('p'); ledger.className = 'order-meta';
    ledger.textContent = `Payments: ${order.payments.length} · Refunds: ${money(order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0))}`;
    const actions = document.createElement('div'); actions.className = 'order-actions';
    if (state.user.role === 'customer' && order.status === 'PENDING_PAYMENT') {
      const pay = actionButton('Pay (simulated)', async () => {
        // Reusing this key makes a repeated click safe after a network retry.
        await api(`/orders/${order.id}/payments`, { method: 'POST', headers: { 'Idempotency-Key': `ui-order-${order.id}` } });
        notify(`Order #${order.id} paid.`); await refreshOrders();
      });
      actions.append(pay);
    }
    if (state.user.role === 'customer' && ['PENDING_PAYMENT', 'PAID'].includes(order.status)) {
      const cancel = actionButton('Cancel order', async () => {
        await api(`/orders/${order.id}/cancel`, { method: 'POST' });
        notify(`Order #${order.id} cancelled.`); await Promise.all([refreshProducts(), refreshOrders()]);
      });
      actions.append(cancel);
    }
    if (state.user.role === 'admin' && ['PAID', 'PARTIALLY_REFUNDED'].includes(order.status)) {
      const input = document.createElement('input'); input.className = 'refund-input'; input.type = 'number'; input.min = '0.01'; input.step = '0.01';
      input.placeholder = 'TRY amount'; input.setAttribute('aria-label', `Refund amount for order ${order.id}`);
      const refund = actionButton('Issue refund', async () => {
        const amountCents = Math.round(Number(input.value) * 100);
        await api(`/orders/${order.id}/refunds`, { method: 'POST', body: JSON.stringify({ amountCents }) });
        notify(`Refund recorded for order #${order.id}.`); await refreshOrders();
      });
      actions.append(input, refund);
    }
    card.append(top, meta, ledger, actions); root.append(card);
  }
}

function actionButton(label, action) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'small-button'; button.textContent = label;
  button.addEventListener('click', async () => { button.disabled = true; try { await action(); } catch (error) { notify(error.message, true); button.disabled = false; } });
  return button;
}

async function refreshProducts() { state.products = (await api('/products')).products; renderProducts(); renderCart(); }
async function refreshOrders() { renderOrders((await api('/orders')).orders); }

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await api('/login', { method: 'POST', body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
    state.token = data.token; state.user = data.user;
    sessionStorage.setItem('orderflow-token', data.token); sessionStorage.setItem('orderflow-user', JSON.stringify(data.user));
    renderSession(); await Promise.all([refreshProducts(), refreshOrders()]); notify(`Signed in as ${data.user.displayName}.`);
  } catch (error) { notify(error.message, true); }
});

$('logout').addEventListener('click', () => {
  state.token = null; state.user = null; state.cart.clear(); sessionStorage.removeItem('orderflow-token'); sessionStorage.removeItem('orderflow-user');
  renderSession(); $('notice').hidden = true;
});
$('refresh-products').addEventListener('click', () => void refreshProducts().catch(error => notify(error.message, true)));
$('refresh-orders').addEventListener('click', () => void refreshOrders().catch(error => notify(error.message, true)));
$('place-order').addEventListener('click', async () => {
  try {
    const items = [...state.cart].map(([productId, quantity]) => ({ productId, quantity }));
    const data = await api('/orders', { method: 'POST', body: JSON.stringify({ items }) });
    state.cart.clear(); await Promise.all([refreshProducts(), refreshOrders()]); notify(`Order #${data.order.id} placed. Complete simulated payment below.`);
  } catch (error) { notify(error.message, true); }
});

renderSession();
if (state.user) Promise.all([refreshProducts(), refreshOrders()]).catch(() => {
  sessionStorage.clear(); state.token = null; state.user = null; renderSession(); notify('Session expired. Sign in again.', true);
});
