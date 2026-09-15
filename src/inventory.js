'use strict';

// ---- Inventario: productos + pedidos, compartidos vía Supabase ----
// El inventario ya no vive solo en esta máquina: cada alta/edición/baja de
// producto y cada pedido pegan directo contra Supabase (ver bridge.js /
// inventory.rs), así que todos los que tengan la app ven el mismo
// inventario. Acá en memoria solo se cachea la última copia bajada del
// servidor para no repintar todo desde cero en cada tecla del buscador.
//
// Acceso: la pestaña está bloqueada con la contraseña compartida hasta que
// se ingresa correctamente una vez por sesión de la app (no queda guardada
// en disco — hay que loguearse de nuevo si se cierra y se vuelve a abrir).

const LOW_STOCK_THRESHOLD = 5;
const POLL_INTERVAL_MS = 20000; // repinta cada 20s mientras la pestaña está abierta, para reflejar cambios de otras personas

let inventoryState = { products: [], orders: [], cashMovements: [] };
let renderProducts = () => {}; // reasignada más abajo, dentro del bloque invSubtabs
let renderOrders = () => {}; // reasignada más abajo, dentro del bloque invSubtabs
let renderCash = () => {}; // reasignada más abajo, dentro del bloque invSubtabs
let currentProductView = 'row';
let editingProductId = null;
let productImageDataUrl = null;
let orderCart = []; // [{ productId, name, unitPrice, quantity, stock }]
let inventoryUnlocked = false;
let inventoryPollTimer = null;
let inventoryTabActive = false;

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function genId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function money(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- estado de sincronización (indicador + banner de error) ----

const invSyncStatus = document.getElementById('invSyncStatus');
const invErrorBanner = document.getElementById('invErrorBanner');
const inventoryTabBtn = document.querySelector('.tab[data-view="inventory"]');

function setSyncState(state, label) {
  if (!invSyncStatus) return;
  invSyncStatus.hidden = false;
  invSyncStatus.dataset.state = state;
  invSyncStatus.textContent =
    label || { syncing: 'Sincronizando…', ok: 'Sincronizado', error: 'Sin conexión' }[state] || '';
}

function showInvError(message) {
  if (!invErrorBanner) return;
  invErrorBanner.hidden = false;
  invErrorBanner.textContent = message;
}

function clearInvError() {
  if (!invErrorBanner) return;
  invErrorBanner.hidden = true;
  invErrorBanner.textContent = '';
}

/// true si la respuesta de un comando de inventario vino OK; si no, prende
/// el banner de error (y el estado "no configurado" se resuelve mostrando
/// el modal de ajustes en vez del banner, que es más accionable).
function handleInvResult(res) {
  if (res && res.ok) {
    clearInvError();
    setSyncState('ok');
    return true;
  }
  const msg =
    res && res.error === 'not_configured'
      ? 'Todavía no configuraste la conexión al inventario compartido.'
      : (res && res.message) || 'No se pudo conectar con el inventario compartido.';
  setSyncState('error');
  showInvError(msg);
  return false;
}

// ---- elementos ----

const invSubtabs = document.getElementById('invSubtabs');
const invProductsPanel = document.getElementById('invProductsPanel');
const invOrdersPanel = document.getElementById('invOrdersPanel');
const invCashPanel = document.getElementById('invCashPanel');

const productSearchInput = document.getElementById('productSearchInput');
const productTypeFilter = document.getElementById('productTypeFilter');
const productViewToggle = document.getElementById('productViewToggle');
const addProductBtn = document.getElementById('addProductBtn');
const productsEmpty = document.getElementById('productsEmpty');
const productsRow = document.getElementById('productsRow');
const productsGrid = document.getElementById('productsGrid');

const productModalOverlay = document.getElementById('productModalOverlay');
const productModalTitle = document.getElementById('productModalTitle');
const productImagePicker = document.getElementById('productImagePicker');
const productImagePreview = document.getElementById('productImagePreview');
const productImagePlaceholder = document.getElementById('productImagePlaceholder');
const productNameInput = document.getElementById('productNameInput');
const productTypeInput = document.getElementById('productTypeInput');
const productTypeList = document.getElementById('productTypeList');
const productPurchaseInput = document.getElementById('productPurchaseInput');
const productSaleInput = document.getElementById('productSaleInput');
const productQuantityInput = document.getElementById('productQuantityInput');
const productFormHint = document.getElementById('productFormHint');
const deleteProductBtn = document.getElementById('deleteProductBtn');
const cancelProductBtn = document.getElementById('cancelProductBtn');
const saveProductBtn = document.getElementById('saveProductBtn');
const productModalCloseBtn = document.getElementById('productModalCloseBtn');

const orderSearchInput = document.getElementById('orderSearchInput');
const addOrderBtn = document.getElementById('addOrderBtn');
const ordersEmpty = document.getElementById('ordersEmpty');
const ordersList = document.getElementById('ordersList');

const orderModalOverlay = document.getElementById('orderModalOverlay');
const orderProductSearch = document.getElementById('orderProductSearch');
const orderPickerList = document.getElementById('orderPickerList');
const orderCartEmpty = document.getElementById('orderCartEmpty');
const orderCartList = document.getElementById('orderCartList');
const orderNoteInput = document.getElementById('orderNoteInput');
const orderTotal = document.getElementById('orderTotal');
const orderModalCloseBtn = document.getElementById('orderModalCloseBtn');
const cancelOrderBtn = document.getElementById('cancelOrderBtn');
const confirmOrderBtn = document.getElementById('confirmOrderBtn');

const cashFromInput = document.getElementById('cashFromInput');
const cashToInput = document.getElementById('cashToInput');
const cashClearFilterBtn = document.getElementById('cashClearFilterBtn');
const addCashMovementBtn = document.getElementById('addCashMovementBtn');
const cashBalanceValue = document.getElementById('cashBalanceValue');
const cashIncomeValue = document.getElementById('cashIncomeValue');
const cashExpenseValue = document.getElementById('cashExpenseValue');
const cashEmpty = document.getElementById('cashEmpty');
const cashList = document.getElementById('cashList');

const cashModalOverlay = document.getElementById('cashModalOverlay');
const cashKindToggle = document.getElementById('cashKindToggle');
const cashAmountInput = document.getElementById('cashAmountInput');
const cashDescriptionInput = document.getElementById('cashDescriptionInput');
const cashFormHint = document.getElementById('cashFormHint');
const cashModalCloseBtn = document.getElementById('cashModalCloseBtn');
const cancelCashBtn = document.getElementById('cancelCashBtn');
const saveCashBtn = document.getElementById('saveCashBtn');
let currentCashKind = 'income';

// ---- login overlay (contraseña compartida) ----
// Vive fuera del `if (invSubtabs)` de abajo porque tiene que poder
// mostrarse ni bien se entra a la pestaña, antes de tocar nada del resto
// del inventario. La conexión a Supabase está fija en el backend — acá no
// hay nada que configurar, solo la contraseña para entrar.

const inventoryLoginOverlay = document.getElementById('inventoryLoginOverlay');
const inventoryPasswordInput = document.getElementById('inventoryPasswordInput');
const inventoryLoginHint = document.getElementById('inventoryLoginHint');
const inventoryLoginBtn = document.getElementById('inventoryLoginBtn');

function showInventoryLogin() {
  if (!inventoryLoginOverlay) return;
  inventoryLoginHint.hidden = true;
  inventoryPasswordInput.value = '';
  inventoryLoginOverlay.hidden = false;
  inventoryPasswordInput.focus();
}

function hideInventoryLogin() {
  if (inventoryLoginOverlay) inventoryLoginOverlay.hidden = true;
}

function attemptInventoryLogin() {
  const password = inventoryPasswordInput.value;
  if (!password) {
    inventoryLoginHint.hidden = false;
    inventoryLoginHint.textContent = 'Ingresá la contraseña.';
    return;
  }
  if (!window.signalLog || !window.signalLog.inventoryLogin) return;
  inventoryLoginBtn.disabled = true;
  window.signalLog
    .inventoryLogin(password)
    .then((res) => {
      inventoryLoginBtn.disabled = false;
      if (res && res.ok && res.authorized) {
        inventoryUnlocked = true;
        hideInventoryLogin();
        loadInventoryData();
        startInventoryPolling();
        return;
      }
      inventoryLoginHint.hidden = false;
      if (res && res.ok && !res.authorized) {
        inventoryLoginHint.textContent = 'Contraseña incorrecta.';
      } else if (res && res.error === 'not_configured') {
        inventoryLoginHint.textContent = 'El inventario todavía no está conectado — avisale a quien administra la app.';
      } else {
        inventoryLoginHint.textContent = (res && res.message) || 'No se pudo verificar la contraseña.';
      }
    })
    .catch(() => {
      inventoryLoginBtn.disabled = false;
      inventoryLoginHint.hidden = false;
      inventoryLoginHint.textContent = 'No se pudo conectar con el inventario compartido.';
    });
}

if (inventoryLoginBtn) inventoryLoginBtn.addEventListener('click', attemptInventoryLogin);
if (inventoryPasswordInput) {
  inventoryPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') attemptInventoryLogin();
  });
}

function stopInventoryPolling() {
  if (inventoryPollTimer) {
    clearInterval(inventoryPollTimer);
    inventoryPollTimer = null;
  }
}

function startInventoryPolling() {
  stopInventoryPolling();
  inventoryPollTimer = setInterval(() => {
    if (inventoryTabActive && inventoryUnlocked) loadInventoryData({ silent: true });
  }, POLL_INTERVAL_MS);
}

function loadInventoryData(opts) {
  const silent = opts && opts.silent;
  if (!window.signalLog || !window.signalLog.getInventory) return;
  if (!silent) setSyncState('syncing');
  window.signalLog
    .getInventory()
    .then((data) => {
      if (!handleInvResult(data)) return;
      inventoryState = {
        products: Array.isArray(data.products) ? data.products : [],
        orders: Array.isArray(data.orders) ? data.orders : [],
        cashMovements: Array.isArray(data.cashMovements) ? data.cashMovements : [],
      };
      renderProducts();
      renderOrders();
      renderCash();
    })
    .catch((err) => {
      console.error('inventory_get failed:', err); // dejalo mientras testeás; podés sacarlo después
      setSyncState('error');
      showInvError('No se pudo conectar con el inventario compartido.');
    });
}

// Se llama cuando se hace click en la pestaña "Inventario": si ya se
// desbloqueó en esta sesión, refresca directo; si no, pide la contraseña.
if (inventoryTabBtn) {
  inventoryTabBtn.addEventListener('click', () => {
    inventoryTabActive = true;
    if (inventoryUnlocked) {
      loadInventoryData();
      startInventoryPolling();
    } else {
      showInventoryLogin();
    }
  });
}
// Al salir de la pestaña (cualquier otro tab) dejamos de pollear en segundo plano.
document.querySelectorAll('.tab').forEach((btn) => {
  if (btn !== inventoryTabBtn) {
    btn.addEventListener('click', () => {
      inventoryTabActive = false;
      stopInventoryPolling();
    });
  }
});

if (invSubtabs) {
  // ---- subpestañas Productos / Pedidos / Caja ----

  const updateInvSubtabIndicator = initSlidingIndicator(invSubtabs, '.subtab');
  // Expuesta para que renderer.js pueda recalcular la posición (sin animar)
  // apenas se muestra la pestaña Inventario, que hasta ese momento estaba
  // en display:none y medía todo en 0.
  window.updateInvSubtabIndicator = updateInvSubtabIndicator;

  invSubtabs.addEventListener('click', (event) => {
    const btn = event.target.closest('.subtab');
    if (!btn) return;
    const target = btn.dataset.invview;
    invSubtabs.querySelectorAll('.subtab').forEach((b) => (b.dataset.active = String(b === btn)));
    updateInvSubtabIndicator();
    invProductsPanel.dataset.active = String(target === 'products');
    invOrdersPanel.dataset.active = String(target === 'orders');
    invCashPanel.dataset.active = String(target === 'cash');
  });

  // ============ PRODUCTOS ============

  function distinctTypes() {
    const set = new Set();
    inventoryState.products.forEach((p) => {
      if (p.productType) set.add(p.productType);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }

  function refreshTypeOptions() {
    const types = distinctTypes();
    const currentFilter = productTypeFilter.value;
    productTypeFilter.innerHTML =
      '<option value="">Todos los tipos</option>' +
      types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    if (types.includes(currentFilter)) productTypeFilter.value = currentFilter;

    productTypeList.innerHTML = types.map((t) => `<option value="${esc(t)}"></option>`).join('');
  }

  function filteredProducts() {
    const query = productSearchInput.value.trim().toLowerCase();
    const type = productTypeFilter.value;
    return inventoryState.products.filter((p) => {
      if (type && p.productType !== type) return false;
      if (!query) return true;
      return (
        (p.name || '').toLowerCase().includes(query) ||
        (p.productType || '').toLowerCase().includes(query)
      );
    });
  }

  function qtyClass(qty) {
    if (qty <= 0) return 'is-empty';
    if (qty <= LOW_STOCK_THRESHOLD) return 'is-low';
    return '';
  }

  function thumbHtml(image, name) {
    return image
      ? `<img src="${image}" alt="${esc(name)}" />`
      : `<span class="product-thumb-placeholder">Sin imagen</span>`;
  }

  renderProducts = function renderProducts() {
    refreshTypeOptions();
    const list = filteredProducts();

    productsRow.hidden = currentProductView !== 'row';
    productsGrid.hidden = currentProductView !== 'grid';

    if (list.length === 0) {
      productsEmpty.hidden = false;
      productsEmpty.innerHTML = inventoryState.products.length
        ? 'Ningún producto coincide con la búsqueda o el filtro.'
        : 'Todavía no agregaste productos.<br />Tocá <strong>+ Nuevo producto</strong> para empezar el inventario.';
      productsRow.innerHTML = '';
      productsGrid.innerHTML = '';
      return;
    }
    productsEmpty.hidden = true;

    if (currentProductView === 'row') {
      productsRow.innerHTML = list
        .map(
          (p) => `
        <div class="product-row-item" data-id="${esc(p.id)}">
          <div class="product-row-thumb">${thumbHtml(p.image, p.name)}</div>
          <div class="product-row-name">
            <div class="product-row-title">${esc(p.name || 'Sin nombre')}</div>
            <div class="product-row-type">${esc(p.productType || 'Sin tipo')}</div>
          </div>
          <div class="product-row-metric"><span class="product-metric-label">Compra</span>${money(p.purchasePrice)}</div>
          <div class="product-row-metric"><span class="product-metric-label">Venta</span>${money(p.salePrice)}</div>
          <div class="product-row-metric product-row-qty ${qtyClass(p.quantity)}"><span class="product-metric-label">Stock</span>${p.quantity}</div>
        </div>`
        )
        .join('');
    } else {
      productsGrid.innerHTML = list
        .map(
          (p) => `
        <div class="product-card" data-id="${esc(p.id)}">
          <div class="product-card-image">${thumbHtml(p.image, p.name)}</div>
          <div class="product-card-body">
            <div class="product-card-title">${esc(p.name || 'Sin nombre')}</div>
            <div class="product-card-type">${esc(p.productType || 'Sin tipo')}</div>
            <div class="product-card-prices">
              <span>Compra ${money(p.purchasePrice)}</span>
              <span>Venta ${money(p.salePrice)}</span>
            </div>
            <div class="product-card-qty ${qtyClass(p.quantity)}">Stock: ${p.quantity}</div>
          </div>
        </div>`
        )
        .join('');
    }
  }

  productSearchInput.addEventListener('input', renderProducts);
  productTypeFilter.addEventListener('change', renderProducts);

  productViewToggle.addEventListener('click', (event) => {
    const btn = event.target.closest('.seg-btn');
    if (!btn) return;
    currentProductView = btn.dataset.productview;
    productViewToggle.querySelectorAll('.seg-btn').forEach((b) => (b.dataset.active = String(b === btn)));
    renderProducts();
  });

  function itemClickHandler(event) {
    const item = event.target.closest('[data-id]');
    if (!item) return;
    openProductModal(item.dataset.id);
  }
  productsRow.addEventListener('click', itemClickHandler);
  productsGrid.addEventListener('click', itemClickHandler);

  // ---- modal producto ----

  function openProductModal(id) {
    editingProductId = id || null;
    const product = id ? inventoryState.products.find((p) => p.id === id) : null;

    productModalTitle.textContent = product ? 'Editar producto' : 'Nuevo producto';
    deleteProductBtn.hidden = !product;
    productFormHint.hidden = true;

    productNameInput.value = product ? product.name || '' : '';
    productTypeInput.value = product ? product.productType || '' : '';
    productPurchaseInput.value = product ? product.purchasePrice || '' : '';
    productSaleInput.value = product ? product.salePrice || '' : '';
    productQuantityInput.value = product ? product.quantity ?? '' : '';

    productImageDataUrl = product ? product.image || null : null;
    updateProductImagePreview();

    productModalOverlay.hidden = false;
    productNameInput.focus();
  }

  function closeProductModal() {
    productModalOverlay.hidden = true;
    editingProductId = null;
    productImageDataUrl = null;
  }

  function updateProductImagePreview() {
    if (productImageDataUrl) {
      productImagePreview.src = productImageDataUrl;
      productImagePreview.hidden = false;
      productImagePlaceholder.hidden = true;
    } else {
      productImagePreview.hidden = true;
      productImagePlaceholder.hidden = false;
    }
  }

  addProductBtn.addEventListener('click', () => openProductModal(null));
  productModalCloseBtn.addEventListener('click', closeProductModal);
  cancelProductBtn.addEventListener('click', closeProductModal);
  productModalOverlay.addEventListener('click', (event) => {
    if (event.target === productModalOverlay) closeProductModal();
  });

  productImagePicker.addEventListener('click', () => {
    if (!window.signalLog || !window.signalLog.openImage) return;
    window.signalLog.openImage().then((res) => {
      if (res && res.ok && res.dataUrl) {
        productImageDataUrl = res.dataUrl;
        updateProductImagePreview();
      }
    });
  });

  saveProductBtn.addEventListener('click', () => {
    const name = productNameInput.value.trim();
    if (!name) {
      productFormHint.hidden = false;
      productFormHint.textContent = 'Ponele un nombre al producto.';
      productNameInput.focus();
      return;
    }
    if (!window.signalLog || !window.signalLog.saveProduct) return;

    const product = {
      id: editingProductId || genId(),
      name,
      image: productImageDataUrl || null,
      purchasePrice: Number(productPurchaseInput.value) || 0,
      salePrice: Number(productSaleInput.value) || 0,
      quantity: Math.max(0, Math.trunc(Number(productQuantityInput.value) || 0)),
      productType: productTypeInput.value.trim(),
    };

    saveProductBtn.disabled = true;
    setSyncState('syncing');
    window.signalLog
      .saveProduct(product)
      .then((res) => {
        saveProductBtn.disabled = false;
        if (!handleInvResult(res)) return;
        if (editingProductId) {
          const idx = inventoryState.products.findIndex((p) => p.id === editingProductId);
          if (idx !== -1) inventoryState.products[idx] = product;
        } else {
          inventoryState.products.push(product);
        }
        renderProducts();
        closeProductModal();
      })
      .catch(() => {
        saveProductBtn.disabled = false;
        setSyncState('error');
        showInvError('No se pudo guardar el producto — revisá la conexión.');
      });
  });

  deleteProductBtn.addEventListener('click', () => {
    if (!editingProductId) return;
    const doDelete = () => {
      if (!window.signalLog || !window.signalLog.deleteProduct) return;
      const id = editingProductId;
      setSyncState('syncing');
      window.signalLog
        .deleteProduct(id)
        .then((res) => {
          if (!handleInvResult(res)) return;
          inventoryState.products = inventoryState.products.filter((p) => p.id !== id);
          renderProducts();
          closeProductModal();
        })
        .catch(() => {
          setSyncState('error');
          showInvError('No se pudo eliminar el producto — revisá la conexión.');
        });
    };
    if (window.signalLogConfirm) {
      window.signalLogConfirm('¿Eliminar este producto del inventario? No se puede deshacer.', {
        title: 'Eliminar producto',
        kind: 'warning',
      }).then((ok) => {
        if (ok) doDelete();
      });
    } else {
      doDelete();
    }
  });

  // ============ PEDIDOS ============

  renderOrders = function renderOrders() {
    const query = orderSearchInput.value.trim().toLowerCase();
    const orders = inventoryState.orders.filter((o) => {
      if (!query) return true;
      const haystack = [
        o.note || '',
        ...(o.items || []).map((i) => i.productName || ''),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });

    if (orders.length === 0) {
      ordersEmpty.hidden = false;
      ordersEmpty.innerHTML = inventoryState.orders.length
        ? 'Ningún pedido coincide con la búsqueda.'
        : 'Todavía no armaste ningún pedido.<br />Tocá <strong>+ Nuevo pedido</strong> para elegir productos del inventario.';
      ordersList.hidden = true;
      ordersList.innerHTML = '';
      return;
    }
    ordersEmpty.hidden = true;
    ordersList.hidden = false;

    ordersList.innerHTML = orders
      .map((o) => {
        const date = o.createdAt ? new Date(o.createdAt) : null;
        const dateStr = date && !isNaN(date) ? date.toLocaleString('es-AR') : '';
        const items = (o.items || [])
          .map(
            (i) => `
          <div class="order-card-item">
            <span>${i.quantity}× ${esc(i.productName)}</span>
            <span>${money(i.unitPrice * i.quantity)}</span>
          </div>`
          )
          .join('');
        return `
        <div class="order-card" data-id="${esc(o.id)}">
          <div class="order-card-header">
            <div>
              <div class="order-card-id">Pedido #${esc(String(o.id).slice(0, 8))}</div>
              <div class="order-card-date">${esc(dateStr)}</div>
            </div>
            <div class="order-card-total">${money(o.total)}</div>
          </div>
          ${o.note ? `<div class="order-card-note">${esc(o.note)}</div>` : ''}
          <div class="order-card-items">${items}</div>
          <div class="order-card-actions">
            <button class="btn btn-ghost btn-danger" data-action="delete-order" type="button">Eliminar pedido</button>
          </div>
        </div>`;
      })
      .join('');
  }

  orderSearchInput.addEventListener('input', renderOrders);

  ordersList.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="delete-order"]');
    if (!btn) return;
    const card = event.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const doDelete = () => {
      if (!window.signalLog || !window.signalLog.deleteOrder) return;
      setSyncState('syncing');
      window.signalLog
        .deleteOrder(id)
        .then((res) => {
          if (!handleInvResult(res)) return;
          inventoryState.orders = inventoryState.orders.filter((o) => o.id !== id);
          inventoryState.cashMovements = inventoryState.cashMovements.filter((m) => m.orderId !== id);
          renderOrders();
          renderCash();
        })
        .catch(() => {
          setSyncState('error');
          showInvError('No se pudo eliminar el pedido — revisá la conexión.');
        });
    };
    if (window.signalLogConfirm) {
      window.signalLogConfirm('¿Eliminar este pedido del historial? No se puede deshacer.', {
        title: 'Eliminar pedido',
        kind: 'warning',
      }).then((ok) => {
        if (ok) doDelete();
      });
    } else {
      doDelete();
    }
  });

  // ---- modal pedido: armar un pedido a partir del inventario ----

  function cartQtyFor(productId) {
    const line = orderCart.find((l) => l.productId === productId);
    return line ? line.quantity : 0;
  }

  function renderOrderPicker() {
    const query = orderProductSearch.value.trim().toLowerCase();
    const list = inventoryState.products.filter((p) => {
      if (!query) return true;
      return (p.name || '').toLowerCase().includes(query) || (p.productType || '').toLowerCase().includes(query);
    });

    if (list.length === 0) {
      orderPickerList.innerHTML = '<div class="order-picker-empty">No hay productos que coincidan.</div>';
      return;
    }

    orderPickerList.innerHTML = list
      .map((p) => {
        const inCart = cartQtyFor(p.id);
        const available = p.quantity - inCart;
        const disabled = available <= 0 ? 'disabled' : '';
        return `
        <div class="order-picker-item" data-id="${esc(p.id)}">
          <div class="order-picker-thumb">${thumbHtml(p.image, p.name)}</div>
          <div class="order-picker-info">
            <div class="order-picker-name">${esc(p.name || 'Sin nombre')}</div>
            <div class="order-picker-meta">${money(p.salePrice)} · stock disponible: ${available}</div>
          </div>
          <button class="btn btn-ghost btn-icon" data-action="add-to-cart" type="button" ${disabled}>+</button>
        </div>`;
      })
      .join('');
  }

  function renderOrderCart() {
    if (orderCart.length === 0) {
      orderCartEmpty.hidden = false;
      orderCartList.hidden = true;
      orderCartList.innerHTML = '';
    } else {
      orderCartEmpty.hidden = true;
      orderCartList.hidden = false;
      orderCartList.innerHTML = orderCart
        .map(
          (line) => `
        <div class="order-cart-item" data-id="${esc(line.productId)}">
          <div class="order-cart-info">
            <div class="order-cart-name">${esc(line.name)}</div>
            <div class="order-cart-meta">${money(line.unitPrice)} c/u</div>
          </div>
          <div class="order-cart-qty">
            <button class="btn btn-ghost btn-icon" data-action="dec" type="button">−</button>
            <input class="order-cart-qty-input" data-action="qty" type="number" min="1" max="${line.stock}" step="1" value="${line.quantity}" />
            <button class="btn btn-ghost btn-icon" data-action="inc" type="button" ${line.quantity >= line.stock ? 'disabled' : ''}>+</button>
          </div>
          <div class="order-cart-subtotal">${money(line.unitPrice * line.quantity)}</div>
          <button class="btn btn-ghost btn-icon btn-danger" data-action="remove" type="button" title="Quitar">🗑</button>
        </div>`
        )
        .join('');
    }

    const total = orderCart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    orderTotal.textContent = `Total: ${money(total)}`;
    confirmOrderBtn.disabled = orderCart.length === 0;
  }

  function openOrderModal() {
    orderCart = [];
    orderProductSearch.value = '';
    orderNoteInput.value = '';
    renderOrderPicker();
    renderOrderCart();
    orderModalOverlay.hidden = false;
    orderProductSearch.focus();
  }

  function closeOrderModal() {
    orderModalOverlay.hidden = true;
    orderCart = [];
  }

  addOrderBtn.addEventListener('click', openOrderModal);
  orderModalCloseBtn.addEventListener('click', closeOrderModal);
  cancelOrderBtn.addEventListener('click', closeOrderModal);
  orderModalOverlay.addEventListener('click', (event) => {
    if (event.target === orderModalOverlay) closeOrderModal();
  });

  orderProductSearch.addEventListener('input', renderOrderPicker);

  orderPickerList.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="add-to-cart"]');
    if (!btn || btn.disabled) return;
    const item = event.target.closest('[data-id]');
    const product = inventoryState.products.find((p) => p.id === item.dataset.id);
    if (!product) return;

    let line = orderCart.find((l) => l.productId === product.id);
    if (line) {
      if (line.quantity < line.stock) line.quantity += 1;
    } else {
      orderCart.push({
        productId: product.id,
        name: product.name || 'Sin nombre',
        unitPrice: product.salePrice || 0,
        quantity: 1,
        stock: product.quantity || 0,
      });
    }
    renderOrderPicker();
    renderOrderCart();
  });

  orderCartList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-id]');
    if (!row) return;
    const line = orderCart.find((l) => l.productId === row.dataset.id);
    if (!line) return;
    const action = event.target.closest('[data-action]');
    if (!action) return;

    if (action.dataset.action === 'inc' && line.quantity < line.stock) {
      line.quantity += 1;
    } else if (action.dataset.action === 'dec') {
      line.quantity -= 1;
      if (line.quantity <= 0) orderCart = orderCart.filter((l) => l !== line);
    } else if (action.dataset.action === 'remove') {
      orderCart = orderCart.filter((l) => l !== line);
    } else {
      return; // click en el input de cantidad (p. ej. para enfocarlo): no repintar
    }
    renderOrderPicker();
    renderOrderCart();
  });

  // Cantidad manual: se confirma con "change" (blur o Enter) para no
  // repintar el carrito en cada tecla y perder el foco/cursor mientras se
  // escribe. Si el valor es inválido o supera el stock, se ajusta solo.
  function commitCartQtyInput(input) {
    const row = input.closest('[data-id]');
    if (!row) return;
    const line = orderCart.find((l) => l.productId === row.dataset.id);
    if (!line) return;
    let qty = Math.trunc(Number(input.value));
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    if (qty > line.stock) qty = line.stock;
    line.quantity = qty;
    renderOrderPicker();
    renderOrderCart();
  }

  orderCartList.addEventListener('change', (event) => {
    const input = event.target.closest('[data-action="qty"]');
    if (!input) return;
    commitCartQtyInput(input);
  });

  orderCartList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const input = event.target.closest('[data-action="qty"]');
    if (!input) return;
    event.preventDefault();
    input.blur(); // dispara el "change" de arriba
  });

  confirmOrderBtn.addEventListener('click', () => {
    if (orderCart.length === 0) return;
    if (!window.signalLog || !window.signalLog.confirmOrder) return;
    const total = orderCart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const order = {
      id: genId(),
      createdAt: new Date().toISOString(),
      items: orderCart.map((l) => ({
        productId: l.productId,
        productName: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      total,
      note: orderNoteInput.value.trim() || null,
    };

    // El nuevo stock se calcula acá (con lo que tenemos cargado en
    // memoria) y se lo mandamos al backend, que lo aplica en Supabase antes
    // de guardar el pedido — así el descuento y el historial quedan
    // sincronizados con todos los demás.
    const adjustments = orderCart.map((line) => {
      const product = inventoryState.products.find((p) => p.id === line.productId);
      const currentQty = product ? product.quantity : line.stock;
      return { productId: line.productId, newQuantity: Math.max(0, currentQty - line.quantity) };
    });

    confirmOrderBtn.disabled = true;
    setSyncState('syncing');
    window.signalLog
      .confirmOrder(order, adjustments)
      .then((res) => {
        confirmOrderBtn.disabled = false;
        if (!handleInvResult(res)) return;
        adjustments.forEach((adj) => {
          const product = inventoryState.products.find((p) => p.id === adj.productId);
          if (product) product.quantity = adj.newQuantity;
        });
        inventoryState.orders.unshift(order);
        if (res.cashMovement) inventoryState.cashMovements.unshift(res.cashMovement);
        renderProducts();
        renderOrders();
        renderCash();
        closeOrderModal();
      })
      .catch(() => {
        confirmOrderBtn.disabled = false;
        setSyncState('error');
        showInvError('No se pudo confirmar el pedido — revisá la conexión.');
      });
  });

  // ============ CAJA ============
  // Saldo actual = suma de TODOS los movimientos históricos (no se ve
  // afectado por el filtro de fecha). Entradas/Salidas del período sí
  // respetan el filtro, para poder ver por ej. cuánto entró este mes.

  function cashDateInRange(movement) {
    const from = cashFromInput.value; // 'YYYY-MM-DD' o ''
    const to = cashToInput.value;
    if (!from && !to) return true;
    const day = (movement.createdAt || '').slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }

  function filteredCashMovements() {
    return inventoryState.cashMovements.filter(cashDateInRange);
  }

  function formatCashDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  renderCash = function renderCash() {
    const balance = inventoryState.cashMovements.reduce(
      (sum, m) => sum + (m.kind === 'expense' ? -m.amount : m.amount),
      0
    );
    const list = filteredCashMovements();
    const income = list.filter((m) => m.kind !== 'expense').reduce((sum, m) => sum + m.amount, 0);
    const expense = list.filter((m) => m.kind === 'expense').reduce((sum, m) => sum + m.amount, 0);

    cashBalanceValue.textContent = money(balance);
    cashIncomeValue.textContent = money(income);
    cashExpenseValue.textContent = money(expense);

    if (list.length === 0) {
      cashEmpty.hidden = false;
      cashList.hidden = true;
      cashList.innerHTML = '';
      return;
    }
    cashEmpty.hidden = true;
    cashList.hidden = false;

    cashList.innerHTML = list
      .map((m) => {
        const sign = m.kind === 'expense' ? '−' : '+';
        const canDelete = !m.orderId; // los que vienen de un pedido se borran borrando el pedido
        return `
        <div class="cash-row" data-id="${esc(m.id)}">
          <div class="cash-row-kind ${m.kind === 'expense' ? 'expense' : 'income'}"></div>
          <div class="cash-row-info">
            <div class="cash-row-description">${esc(m.description || (m.kind === 'expense' ? 'Salida' : 'Entrada'))}</div>
            <div class="cash-row-date">${esc(formatCashDate(m.createdAt))}</div>
          </div>
          <div class="cash-row-amount ${m.kind === 'expense' ? 'expense' : 'income'}">${sign} ${money(m.amount)}</div>
          <div class="cash-row-actions">
            ${canDelete ? '<button class="btn btn-ghost btn-icon btn-danger" data-action="delete-cash" type="button" title="Eliminar">🗑</button>' : ''}
          </div>
        </div>`;
      })
      .join('');
  };

  cashFromInput.addEventListener('change', renderCash);
  cashToInput.addEventListener('change', renderCash);
  cashClearFilterBtn.addEventListener('click', () => {
    cashFromInput.value = '';
    cashToInput.value = '';
    renderCash();
  });

  cashList.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="delete-cash"]');
    if (!btn) return;
    const row = event.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const doDelete = () => {
      if (!window.signalLog || !window.signalLog.deleteCashMovement) return;
      setSyncState('syncing');
      window.signalLog
        .deleteCashMovement(id)
        .then((res) => {
          if (!handleInvResult(res)) return;
          inventoryState.cashMovements = inventoryState.cashMovements.filter((m) => m.id !== id);
          renderCash();
        })
        .catch(() => {
          setSyncState('error');
          showInvError('No se pudo eliminar el movimiento — revisá la conexión.');
        });
    };
    if (window.signalLogConfirm) {
      window.signalLogConfirm('¿Eliminar este movimiento de caja? No se puede deshacer.', {
        title: 'Eliminar movimiento',
        kind: 'warning',
      }).then((ok) => {
        if (ok) doDelete();
      });
    } else {
      doDelete();
    }
  });

  // ---- modal: nuevo movimiento manual ----

  function openCashModal() {
    currentCashKind = 'income';
    cashKindToggle.querySelectorAll('.seg-btn').forEach((b) => (b.dataset.active = String(b.dataset.cashkind === 'income')));
    cashAmountInput.value = '';
    cashDescriptionInput.value = '';
    cashFormHint.hidden = true;
    cashModalOverlay.hidden = false;
    cashAmountInput.focus();
  }

  function closeCashModal() {
    cashModalOverlay.hidden = true;
  }

  addCashMovementBtn.addEventListener('click', openCashModal);
  cashModalCloseBtn.addEventListener('click', closeCashModal);
  cancelCashBtn.addEventListener('click', closeCashModal);
  cashModalOverlay.addEventListener('click', (event) => {
    if (event.target === cashModalOverlay) closeCashModal();
  });

  cashKindToggle.addEventListener('click', (event) => {
    const btn = event.target.closest('.seg-btn');
    if (!btn) return;
    currentCashKind = btn.dataset.cashkind;
    cashKindToggle.querySelectorAll('.seg-btn').forEach((b) => (b.dataset.active = String(b === btn)));
  });

  saveCashBtn.addEventListener('click', () => {
    const amount = Number(cashAmountInput.value) || 0;
    if (amount <= 0) {
      cashFormHint.hidden = false;
      cashFormHint.textContent = 'Ingresá un monto mayor a 0.';
      cashAmountInput.focus();
      return;
    }
    if (!window.signalLog || !window.signalLog.addCashMovement) return;

    const movement = {
      id: genId(),
      createdAt: new Date().toISOString(),
      kind: currentCashKind,
      amount,
      description: cashDescriptionInput.value.trim(),
      orderId: null,
    };

    saveCashBtn.disabled = true;
    setSyncState('syncing');
    window.signalLog
      .addCashMovement(movement)
      .then((res) => {
        saveCashBtn.disabled = false;
        if (!handleInvResult(res)) return;
        inventoryState.cashMovements.unshift(movement);
        renderCash();
        closeCashModal();
      })
      .catch(() => {
        saveCashBtn.disabled = false;
        setSyncState('error');
        showInvError('No se pudo guardar el movimiento — revisá la conexión.');
      });
  });

  // ---- Escape cierra el modal que esté abierto ----
  // El overlay de login NO se cierra con Escape a propósito: es el
  // gatekeeper del inventario, no un modal más.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!productModalOverlay.hidden) closeProductModal();
    if (!orderModalOverlay.hidden) closeOrderModal();
    if (!cashModalOverlay.hidden) closeCashModal();
  });
}