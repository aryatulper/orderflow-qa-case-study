// A directly opened HTML file can preview the UI, but cannot call our API.
const isFilePreview = location.protocol === 'file:';
const state = {
  token: isFilePreview ? null : sessionStorage.getItem('orderflow-token'),
  user: isFilePreview ? null : JSON.parse(sessionStorage.getItem('orderflow-user') || 'null'),
  products: [], orders: [], cart: new Map(), placingOrder: false
};
const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('en-TR', { style: 'currency', currency: 'TRY' }).format(cents / 100);
const dateTime = value => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
let noticeTimer;

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
  clearTimeout(noticeTimer);
  box.textContent = message;
  box.classList.toggle('error', error);
  box.setAttribute('role', error ? 'alert' : 'status');
  box.setAttribute('aria-live', error ? 'assertive' : 'polite');
  box.hidden = false;
  if (!error) noticeTimer = setTimeout(() => { box.hidden = true; }, 6000);
}

function renderSession() {
  document.body.classList.toggle('is-signed-in', !!state.user);
  $('login-panel').hidden = !!state.user;
  $('workspace').hidden = !state.user;
  document.querySelector('.site-nav').hidden = !state.user;
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
    const identity = document.createElement('div');
    const index = document.createElement('span'); index.className = 'product-index'; index.textContent = `ITEM ${String(product.id).padStart(2, '0')}`;
    const title = document.createElement('h4'); title.textContent = product.name;
    const stock = document.createElement('span'); stock.className = 'stock'; stock.textContent = `${product.stock} in stock`;
    if (product.stock <= 5) stock.classList.add('low-stock');
    const bottom = document.createElement('div'); bottom.className = 'bottom';
    const price = document.createElement('strong'); price.textContent = money(product.priceCents);
    const add = document.createElement('button'); add.type = 'button';
    const isCustomer = state.user?.role === 'customer';
    if (!isCustomer) {
      add.textContent = 'Customer only';
      add.setAttribute('aria-label', `${product.name} is for customer checkout only`);
    } else if (product.stock < 1) {
      add.textContent = 'Out of stock';
      add.setAttribute('aria-label', `${product.name} is out of stock`);
    } else {
      add.textContent = 'Add to cart';
      add.setAttribute('aria-label', `Add ${product.name} to cart`);
    }
    add.disabled = product.stock < 1 || !isCustomer;
    add.addEventListener('click', () => {
      const quantity = (state.cart.get(product.id) || 0) + 1;
      if (quantity > product.stock) return notify('No more stock available for this product.', true);
      state.cart.set(product.id, quantity); renderCart();
    });
    identity.append(index, title, stock); bottom.append(price, add); card.append(identity, bottom); root.append(card);
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
  const count = [...state.cart.values()].reduce((sum, quantity) => sum + quantity, 0);
  $('cart-count').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
  $('place-order').disabled = state.cart.size === 0 || state.placingOrder;
}

// Buttons reflect order state, but the API still enforces roles and transitions.
function renderOrders(orders) {
  const root = $('orders'); root.replaceChildren();
  const status = $('order-filter').value;
  const visibleOrders = status ? orders.filter(order => order.status === status) : orders;
  if (visibleOrders.length === 0) {
    const empty = document.createElement('p'); empty.className = 'muted';
    empty.textContent = orders.length ? 'No orders in this state.' : 'No orders yet.';
    root.append(empty);
    return;
  }
  for (const order of visibleOrders) {
    const card = document.createElement('article'); card.className = 'order'; card.setAttribute('data-order-id', String(order.id));
    card.dataset.status = order.status;
    card.tabIndex = -1;
    const top = document.createElement('div'); top.className = 'order-top';
    const title = document.createElement('h4'); title.textContent = `Order #${order.id}`;
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = order.status.replaceAll('_', ' ');
    top.append(title, badge);
    const meta = document.createElement('p'); meta.className = 'order-meta';
    meta.textContent = `${order.items.map(item => `${item.quantity} × ${item.name}`).join(', ')} · ${money(order.totalCents)} · ${dateTime(order.createdAt)}`;
    const ledger = document.createElement('p'); ledger.className = 'order-meta order-ledger';
    ledger.textContent = `Payments: ${order.payments.length} · Refunds: ${money(order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0))}`;
    const actions = document.createElement('div'); actions.className = 'order-actions';
    if (state.user.role === 'customer' && order.status === 'PENDING_PAYMENT') {
      const pay = actionButton('Pay (simulated)', async () => {
        // Reusing this key makes a repeated click safe after a network retry.
        await api(`/orders/${order.id}/payments`, { method: 'POST', headers: { 'Idempotency-Key': `ui-order-${order.id}` } });
        notify(`Order #${order.id} paid.`); await refreshOrders(order.id);
      });
      actions.append(pay);
    }
    if (state.user.role === 'customer' && ['PENDING_PAYMENT', 'PAID'].includes(order.status)) {
      const cancel = actionButton('Cancel order', async () => {
        await api(`/orders/${order.id}/cancel`, { method: 'POST' });
        notify(`Order #${order.id} cancelled.`); await Promise.all([refreshProducts(), refreshOrders(order.id)]);
      });
      actions.append(cancel);
    }
    if (state.user.role === 'admin' && ['PAID', 'PARTIALLY_REFUNDED'].includes(order.status)) {
      const refundedCents = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
      const remainingCents = order.totalCents - refundedCents;
      const input = document.createElement('input'); input.className = 'refund-input'; input.type = 'number'; input.min = '0.01'; input.step = '0.01';
      input.max = String(remainingCents / 100);
      input.placeholder = 'TRY amount'; input.setAttribute('aria-label', `Refund amount for order ${order.id}`);
      const refund = actionButton('Issue refund', async () => {
        const amount = Number(input.value);
        const amountCents = Math.round(amount * 100);
        if (!Number.isFinite(amount) || amountCents <= 0 || amountCents > remainingCents || Math.abs(amount * 100 - amountCents) > 0.00001) {
          input.focus();
          throw new Error(`Enter an amount between ₺0.01 and ${money(remainingCents)}.`);
        }
        await api(`/orders/${order.id}/refunds`, { method: 'POST', body: JSON.stringify({ amountCents }) });
        notify(`Refund recorded for order #${order.id}.`); await refreshOrders(order.id);
      });
      const hint = document.createElement('span'); hint.className = 'refund-hint'; hint.textContent = `Available: ${money(remainingCents)}`;
      actions.append(input, refund, hint);
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
async function refreshOrders(focusOrderId) {
  state.orders = (await api('/orders')).orders;
  const filter = $('order-filter');
  if (focusOrderId && filter.value && !state.orders.some(order => order.id === focusOrderId && order.status === filter.value)) filter.value = '';
  renderOrders(state.orders);
  if (focusOrderId) document.querySelector(`.order[data-order-id="${focusOrderId}"]`)?.focus();
}
$('order-filter').addEventListener('change', () => renderOrders(state.orders));

// Account shortcuts are only form presets; authentication still goes through the API.
const demoAccounts = [...document.querySelectorAll('.demo-account')];
function updateDemoSelection() {
  for (const button of demoAccounts) button.setAttribute('aria-pressed', String(button.dataset.demoEmail === $('email').value));
}
for (const button of demoAccounts) button.addEventListener('click', () => {
  $('email').value = button.dataset.demoEmail;
  $('password').value = 'demo123';
  updateDemoSelection();
  $('password').focus();
});
$('email').addEventListener('input', updateDemoSelection);

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = $('login-form').querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Signing in…';
  try {
    const data = await api('/login', { method: 'POST', body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
    state.token = data.token; state.user = data.user;
    sessionStorage.setItem('orderflow-token', data.token); sessionStorage.setItem('orderflow-user', JSON.stringify(data.user));
    renderSession(); await Promise.all([refreshProducts(), refreshOrders()]);
  } catch (error) { notify(error.message, true); }
  finally { submit.disabled = false; submit.textContent = 'Sign in'; }
});

$('logout').addEventListener('click', () => {
  state.token = null; state.user = null; state.orders = []; state.cart.clear(); $('order-filter').value = ''; sessionStorage.removeItem('orderflow-token'); sessionStorage.removeItem('orderflow-user');
  clearTimeout(noticeTimer); renderSession(); $('notice').hidden = true;
});
$('refresh-products').addEventListener('click', () => void refreshProducts().catch(error => notify(error.message, true)));
$('refresh-orders').addEventListener('click', () => void refreshOrders().catch(error => notify(error.message, true)));
$('place-order').addEventListener('click', async () => {
  if (state.placingOrder) return;
  state.placingOrder = true;
  const submit = $('place-order');
  submit.disabled = true;
  submit.textContent = 'Placing order…';
  try {
    const items = [...state.cart].map(([productId, quantity]) => ({ productId, quantity }));
    const data = await api('/orders', { method: 'POST', body: JSON.stringify({ items }) });
    state.cart.clear(); await Promise.all([refreshProducts(), refreshOrders(data.order.id)]); notify(`Order #${data.order.id} placed. Complete simulated payment below.`);
  } catch (error) { notify(error.message, true); }
  finally { state.placingOrder = false; submit.textContent = 'Place order'; submit.disabled = state.cart.size === 0; }
});

if (isFilePreview) {
  $('local-file-help').hidden = false;
  $('login-panel').hidden = true;
  document.querySelector('.site-nav').hidden = true;
  $('current-user').textContent = 'File preview';
} else {
  renderSession();
  if (state.user) Promise.all([refreshProducts(), refreshOrders()]).catch(() => {
    sessionStorage.clear(); state.token = null; state.user = null; renderSession(); notify('Session expired. Sign in again.', true);
  });
}
