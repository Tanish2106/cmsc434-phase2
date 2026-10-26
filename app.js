const STORAGE_KEY = 'kitchen-kompanion';
let data = loadData();
let currentLocation = 'All';
let searchText = '';

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
  }
  return seedData();
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) { }
}

function nextId() {
  data.lastId = (data.lastId || 200) + 1;
  return data.lastId;
}


function formatQty(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function daysLeft(item) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(item.expires + 'T00:00:00');
  return Math.round((exp - today) / 86400000);
}

function expiryLabel(item) {
  const d = daysLeft(item);
  if (d < 0) return 'Expired';
  if (d === 0) return 'Today';
  if (d === 1) return '1 day';
  if (d <= 13) return d + ' days';
  if (d <= 60) return Math.round(d / 7) + ' wks';
  return Math.round(d / 30) + ' mo';
}

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 1800);
}

// Screens / tabs
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
  const tab = document.getElementById(id).dataset.tab;
  document.querySelectorAll('.tab').forEach(tabButton => tabButton.classList.toggle('active', tabButton.dataset.tab === tab));
  closeNumpad();
  hideKeyboard();
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showScreen(tab.dataset.tab + 'Screen')));

document.getElementById('settingsButton').addEventListener('click', () => showScreen('settingsScreen'));
document.getElementById('settingsBack').addEventListener('click', () => showScreen('kitchenScreen'));
document.getElementById('addBack').addEventListener('click', () => showScreen('kitchenScreen'));

// Kitchen
function renderKitchen() {
  const list = document.getElementById('kitchenList');
  const query = searchText.trim().toLowerCase();

  let items = data.items.filter(item => currentLocation === 'All' || item.location === currentLocation);
  if (query) items = items.filter(item => item.name.toLowerCase().includes(query));

  let html = '';

  // expiring within 3 days goes in the expiring soon section
  const soon = items.filter(item => daysLeft(item) <= 3).sort((a, b) => daysLeft(a) - daysLeft(b));
  if (soon.length) {
    html += `<h2 class="section warn">Expiring soon <span class="count">${soon.length}</span></h2>`;
    html += `<div class="card warn">${soon.map(expiringRow).join('')}</div>`;
  }

  // grouped by where item's stored
  const groups = currentLocation === 'All' ? LOCATIONS : [currentLocation];
  groups.forEach(loc => {
    const inGroup = items.filter(item => item.location === loc).sort((a, b) => a.name.localeCompare(b.name));
    if (!inGroup.length && (query || currentLocation !== 'All')) return;
    html += `<h2 class="section">${loc} <span class="count">${inGroup.length}</span></h2>`;
    html += inGroup.length
      ? `<div class="card">${inGroup.map(itemRow).join('')}</div>`
      : `<div class="card"><div class="empty-note">Nothing in the ${loc.toLowerCase()} yet.</div></div>`;
  });

  if (!items.length) {
    html = `<div class="empty-note">No items match “${searchText}”.</div>`;
  }

  list.innerHTML = html;
}

function expiringRow(item) {
  const qty = formatQty(item.qty) + (item.unit === 'count' ? '' : ' ' + item.unit);
  return `
    <button class="row compact" data-id="${item.id}" data-action="edit">
      <span class="name">${item.name}</span>
      <span class="expiry warn">${expiryLabel(item)}</span>
      <span class="meta">${qty}</span>
      <span class="tag ${item.owner === 'Shared' ? 'shared' : 'me'}">${item.owner}</span>
    </button>`;
}

function itemRow(item) {
  const soon = daysLeft(item) <= 3;
  const unit = item.unit === 'count' ? '' : ` <span class="unit-label">${item.unit}</span>`;
  return `
    <div class="row" data-id="${item.id}">
      <button class="info" data-action="edit">
        <div class="name">${item.name}</div>
        <div class="meta">
          <span class="tag ${item.owner === 'Shared' ? 'shared' : 'me'}">${item.owner}</span>
          <span class="expiry ${soon ? 'warn' : ''}">${expiryLabel(item)}</span>
        </div>
      </button>
      <div class="stepper">
        <button class="stepper-button" data-action="decrease" aria-label="Decrease">−</button>
        <button class="quantity" data-action="edit-quantity" aria-label="Edit quantity"><span class="value">${formatQty(item.qty)}</span>${unit}</button>
        <button class="stepper-button" data-action="increase" aria-label="Increase">+</button>
      </div>
    </div>`;
}

document.getElementById('kitchenList').addEventListener('click', (event) => {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const row = btn.closest('.row');
  const item = data.items.find(candidate => candidate.id === Number(row.dataset.id));
  if (!item) return;

  switch (btn.dataset.action) {
    case 'increase': changeQty(item, 1); break;
    case 'decrease': changeQty(item, -1); break;
    case 'edit-quantity': openNumpadForRow(item); break;
    case 'edit': openItemForm(item); break;
  }
});

function changeQty(item, direction) {
  const step = STEP_SIZE[item.unit] || 1;
  const next = Math.max(0, Math.round((item.qty + step * direction) * 100) / 100);
  item.qty = next;
  saveData();
  renderKitchen();
  if (next === 0) offerShopList(item);
}

// quantity hit zero, offer to put item on the shopping list
function offerShopList(item) {
  openModal(`Out of ${item.name}`, 'Add item to the Shop list and remove item from the kitchen?', [
    {
      label: 'Add to Shop list', primary: true, onClick: () => {
        data.shop.push({ id: nextId(), name: item.name, qty: DEFAULT_SHOP_QTY[item.unit] || 1, unit: item.unit, done: false });
        data.items = data.items.filter(other => other.id !== item.id);
        saveData();
        renderKitchen();
        renderShop();
        showToast(`${item.name} added to Shop list`);
      }
    },
    {
      label: 'Remove from kitchen', onClick: () => {
        data.items = data.items.filter(other => other.id !== item.id);
        saveData();
        renderKitchen();
      }
    },
    { label: 'Keep at 0', onClick: () => { } },
  ]);
}

// location filter
document.getElementById('locationFilter').addEventListener('click', (event) => {
  const btn = event.target.closest('button');
  if (!btn) return;
  document.getElementById('locationFilter').querySelectorAll('button').forEach(button => button.classList.toggle('active', button === btn));
  currentLocation = btn.dataset.location;
  renderKitchen();
});

// search
document.getElementById('searchButton').addEventListener('click', () => {
  const bar = document.getElementById('searchbar');
  bar.hidden = !bar.hidden;
  if (!bar.hidden) document.getElementById('searchInput').focus();
  else {
    searchText = '';
    document.getElementById('searchInput').value = '';
    renderKitchen();
  }
});
document.getElementById('searchInput').addEventListener('input', (event) => {
  searchText = event.target.value;
  renderKitchen();
});

document.getElementById('searchClear').addEventListener('click', () => {
  searchText = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchbar').hidden = true;
  hideKeyboard();
  renderKitchen();
});

// Add / Edit item
function fillDropdown(select, options, selected) {
  select.innerHTML = options.map(option => `<option value="${option}"${option === selected ? ' selected' : ''}>${option}</option>`).join('');
}

function selectChoice(groupId, value) {
  document.getElementById(groupId).querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.value === value));
}

function selectedChoice(groupId) {
  const on = document.getElementById(groupId).querySelector('button.active');
  return on ? on.dataset.value : null;
}

document.querySelectorAll('.choice').forEach(group => group.addEventListener('click', (event) => {
  const btn = event.target.closest('button');
  if (btn) selectChoice(group.id, btn.dataset.value);
}));

const expireOptions = [];
for (let i = 1; i <= 30; i++) {
  expireOptions.push(i);
}
fillDropdown(document.getElementById('expiresIn'), expireOptions, 7);

function openItemForm(item) {
  const editing = Boolean(item);
  document.getElementById('addTitle').textContent = editing ? 'Edit Item' : 'Add Item';
  document.getElementById('deleteItem').hidden = !editing;
  document.getElementById('nameError').hidden = true;

  document.getElementById('editingItemId').value = editing ? item.id : '';
  document.getElementById('itemName').value = editing ? item.name : '';
  document.getElementById('itemQuantity').value = editing ? formatQty(item.qty) : '1';
  fillDropdown(document.getElementById('itemUnit'), UNITS, editing ? item.unit : 'count');
  fillDropdown(document.getElementById('itemAllergen'), ALLERGENS, editing ? item.allergen : 'None');
  selectChoice('itemLocation', editing ? item.location : 'Fridge');
  selectChoice('itemOwner', editing ? item.owner : 'Me');

  // show remaining time in whatever unit reads best
  let count = editing ? Math.max(1, daysLeft(item)) : 7;
  let unit = 'days';
  if (count >= 60 && count % 30 === 0) { count = count / 30; unit = 'months'; }
  else if (count >= 14 && count % 7 === 0) { count = count / 7; unit = 'weeks'; }
  document.getElementById('expiresIn').value = Math.min(count, 30);
  document.getElementById('expiresUnit').value = unit;

  showScreen('addItemScreen');
  if (!editing) document.getElementById('itemName').focus();
}

document.getElementById('addItemButton').addEventListener('click', () => openItemForm(null));

document.getElementById('resetForm').addEventListener('click', () => openItemForm(null));

document.getElementById('itemQuantity').addEventListener('click', () => {
  openNumpad('Quantity', document.getElementById('itemQuantity').value, (value) => {
    document.getElementById('itemQuantity').value = formatQty(value);
  });
});

document.getElementById('saveItem').addEventListener('click', () => {
  const name = document.getElementById('itemName').value.trim();
  if (!name) {
    document.getElementById('nameError').hidden = false;
    document.getElementById('itemName').focus();
    return;
  }
  const perUnit = { days: 1, weeks: 7, months: 30 }[document.getElementById('expiresUnit').value];
  const item = {
    name,
    qty: parseFloat(document.getElementById('itemQuantity').value) || 0,
    unit: document.getElementById('itemUnit').value,
    location: selectedChoice('itemLocation'),
    owner: selectedChoice('itemOwner'),
    allergen: document.getElementById('itemAllergen').value,
    expires: todayISO(Number(document.getElementById('expiresIn').value) * perUnit),
  };

  const id = Number(document.getElementById('editingItemId').value);
  if (id) {
    Object.assign(data.items.find(existing => existing.id === id), item);
  } else {
    item.id = nextId();
    data.items.push(item);
  }
  saveData();

  currentLocation = item.location;
  document.getElementById('locationFilter').querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.location === item.location));
  renderKitchen();
  showScreen('kitchenScreen');
  const row = document.querySelector(`.row[data-id="${item.id || id}"]`);
  if (row) {
    row.scrollIntoView({ block: 'center' });
  }
  showToast(id ? `${name} updated` : `${name} added to ${item.location}`);
});

document.getElementById('deleteItem').addEventListener('click', () => {
  const id = Number(document.getElementById('editingItemId').value);
  const item = data.items.find(candidate => candidate.id === id);
  openModal(`Remove ${item.name}?`, 'It will disappear from the kitchen.', [
    {
      label: 'Remove', primary: true, onClick: () => {
        data.items = data.items.filter(other => other.id !== id);
        saveData();
        renderKitchen();
        showScreen('kitchenScreen');
        showToast(`${item.name} removed`);
      }
    },
    { label: 'Cancel', onClick: () => { } },
  ]);
});

// Shop
function renderShop() { 
  const list = document.getElementById('BodyShoppingList');
  if (!data.shop.length) {
    list.innerHTML = '<div class="empty-note">Your list is empty.</div>';
    return;
  }

  const atHome = (name) => data.items.find(item => item.name.toLowerCase() === name.toLowerCase());
  const rows = data.shop.map(entry => {
    const home = atHome(entry.name);
    const homeText = home ? `Home: ${formatQty(home.qty)}${home.unit === 'count' ? '' : ' ' + home.unit}` : 'None at home';
    const unit = entry.unit === 'count' ? '' : ' ' + entry.unit;
    return `
      <div class="row ${entry.done ? 'done' : ''}" data-id="${entry.id}">
        <button class="checkbox" data-action="toggle" aria-label="Check off">${entry.done ? '✓' : ''}</button>
        <div class="info">
          <div class="name">${entry.name}</div>
          <div class="meta">${formatQty(entry.qty)}${unit} · ${homeText}</div>
        </div>
        <button type="button" class="btn ghost" data-action="remove">Remove</button>
      </div>`;
  }).join('');

  list.innerHTML = `<h2 class="section">To buy <span class="count">${data.shop.filter(entry => !entry.done).length}</span></h2><div class="card">${rows}</div>`;
}

document.getElementById('BodyShoppingList').addEventListener('click', (event) => {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const entry = data.shop.find(candidate => candidate.id === Number(btn.closest('.row').dataset.id));
  if(btn.dataset.action === 'remove') {
    data.shop = data.shop.filter(item => item.id !== entry.id);
  }else {
    entry.done = !entry.done;
  }
  saveData();
  renderShop();
});


const shopForm = document.getElementById('shopForm');
UNITS.forEach(unit => {
  shopForm.elements.unit.add(new Option (unit,unit));
});
document.querySelectorAll('#shopAdd, #shopAddBottom').forEach(button => {
  button.addEventListener('click', () => {
    shopForm.reset();
    showScreen('shopAddScreen');
  });
});
document.getElementById('shopBack').addEventListener('click', () => {
  showScreen('shopScreen');
});

shopForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = shopForm.elements;
  const name = fields.itemName.value.trim();

  if(!name){
    showToast('Give the name of item');
    return;
  }
  data.shop.push({
    id: Date.now(),
    name,
    qty: Number(fields.qty.value),
    unit: fields.unit.value,
    owner: fields.owner.value.trim() || 'Me',
    done: false
  });
  saveData();
  renderShop();
  showScreen('shopScreen');
});


// Settings
document.getElementById('resetDataButton').addEventListener('click', () => {
  openModal('Reset demo data?', 'Everything you added or changed will be replaced with the sample kitchen.', [
    {
      label: 'Reset', primary: true, onClick: () => {
        data = seedData();
        saveData();
        renderKitchen();
        renderShop();
        showScreen('kitchenScreen');
        showToast('Demo data restored');
      }
    },
    { label: 'Cancel', onClick: () => { } },
  ]);
});

let numpadLabel = '';
let numpadText = '';
let numpadOnDone = null;

function openNumpad(label, currentValue, onDone) {
  hideKeyboard();
  numpadLabel = label;
  numpadText = '';
  numpadOnDone = onDone;
  document.getElementById('numpadTitle').textContent = `${label}: ${currentValue}`;
  document.getElementById('numpad').hidden = false;
}

function closeNumpad() {
  document.getElementById('numpad').hidden = true;
  numpadOnDone = null;
}

function openNumpadForRow(item) {
  const label = item.name + (item.unit === 'count' ? '' : ` (${item.unit})`);
  openNumpad(label, formatQty(item.qty), (value) => {
    item.qty = value;
    saveData();
    renderKitchen();
    if (item.qty === 0) offerShopList(item);
  });
}

document.getElementById('numpadCancel').addEventListener('click', closeNumpad);

document.getElementById('numpadDone').addEventListener('click', () => {
  const onDone = numpadOnDone;
  closeNumpad();
  if (onDone && numpadText !== '') onDone(parseFloat(numpadText) || 0);
});

document.getElementById('numpad').querySelectorAll('.keys button').forEach(key => key.addEventListener('click', () => {
  if (key.classList.contains('backspace')) numpadText = numpadText.slice(0, -1);
  else if (key.textContent === '.' && numpadText.includes('.')) return;
  else if (numpadText.length < 6) numpadText += key.textContent;
  document.getElementById('numpadTitle').textContent = `${numpadLabel}: ${numpadText || '0'}`;
}));

// On-screen keyboard image
function showKeyboard() {
  document.getElementById('keyboard').hidden = false;
}

function hideKeyboard() {
  document.getElementById('keyboard').hidden = true;
}

document.querySelectorAll('.text-input').forEach(input => {
  input.addEventListener('focus', showKeyboard);
  input.addEventListener('blur', hideKeyboard);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur(); });
});

// Modal
function openModal(title, text, buttons) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalText').textContent = text;
  const actions = document.getElementById('modalActions');
  actions.innerHTML = '';
  buttons.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (choice.primary ? 'primary' : 'ghost');
    btn.textContent = choice.label;
    btn.addEventListener('click', () => {
      document.getElementById('modal').hidden = true;
      choice.onClick();
    });
    actions.appendChild(btn);
  });
  document.getElementById('modal').hidden = false;
}

renderKitchen();
renderShop();
