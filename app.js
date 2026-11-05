const STORAGE_KEY = 'kitchen-kompanion';
let data = loadData();
let currentLocation = 'All';
let searchText = '';

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const stored = JSON.parse(saved);
      const defaults = seedData();
      // Older saved kitchens do not have people or settings yet.
      return { ...defaults, ...stored, settings: { ...defaults.settings, ...stored.settings } };
    }
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
  if (id === 'peopleScreen') renderPeople();
  if (id === 'settingsScreen') fillSettings();
  if (id === 'shopScreen') renderShop();
  if (id === 'kitchenScreen') renderReminder();
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
  const tab = document.getElementById(id).dataset.tab;
  document.querySelectorAll('.tab').forEach(tabButton => tabButton.classList.toggle('active', tabButton.dataset.tab === tab));
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
    html = `<div class="empty-note">No items match "${searchText}".</div>`;
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
        <button class="stepper-button" data-action="decrease" aria-label="Decrease">-</button>
        <label class="quantity"><input class="quantity-input text-input number-input" value="${formatQty(item.qty)}" aria-label="Quantity">${unit}</label>
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

// typing a new amount in a row saves it
document.getElementById('kitchenList').addEventListener('change', (event) => {
  if (!event.target.classList.contains('quantity-input')) return;
  const item = data.items.find(candidate => candidate.id === Number(event.target.closest('.row').dataset.id));
  item.qty = parseFloat(event.target.value) || 0;
  event.target.value = formatQty(item.qty);
  saveData();
  if (item.qty === 0) offerShopList(item);
});

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
  select.innerHTML = options.map(option => {
    const text = escapeText(String(option));
    return `<option value="${text}"${option === selected ? ' selected' : ''}>${text}</option>`;
  }).join('');
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

function openItemForm(item, fromShop = false) {
  if(!fromShop) itemAddToInventory = [];
  const editing = Boolean(item);
  document.getElementById('addTitle').textContent = editing ? 'Edit Item' : 'Add Item';
  document.getElementById('deleteItem').hidden = !editing;
  document.getElementById('nameError').hidden = true;

  document.getElementById('editingItemId').value = editing ? item.id : '';
  document.getElementById('itemName').value = editing ? item.name : '';
  document.getElementById('itemQuantity').value = editing ? formatQty(item.qty) : '1';
  fillDropdown(document.getElementById('itemUnit'), UNITS, editing ? item.unit : data.settings.defaultUnit);
  const allergens = [...ALLERGENS];
  data.people.forEach(person => person.allergies.forEach(allergy => {
    if (!allergens.includes(allergy)) allergens.push(allergy);
  }));
  if (editing && !allergens.includes(item.allergen)) allergens.push(item.allergen);
  fillDropdown(document.getElementById('itemAllergen'), allergens, editing ? item.allergen : 'None');
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

document.querySelectorAll('.field-row [data-step]').forEach(button => button.addEventListener('click', () => {
  const row = button.closest('.field-row');
  const box = row.querySelector('.qty');
  const step = STEP_SIZE[row.querySelector('select').value] || 1;
  const value = (parseFloat(box.value) || 0) + Number(button.dataset.step) * step;
  box.value = formatQty(Math.min(999, Math.max(0, value)));
}));

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
  if(itemAddToInventory.length) {
    const transferred = itemAddToInventory.shift();
    data.shop = data.shop.filter(entry => entry.id !== transferred.id);
    renderShop();
  }
  saveData();
  if(itemAddToInventory.length) {
    renderKitchen();
    showToast(`${name} added to ${item.location}`);
    openFormItem();
    return;
  }

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
  const entries = [...data.shop];
  if (data.settings.shopOrder === 'name') entries.sort((a, b) => a.name.localeCompare(b.name));
  if (data.settings.shopOrder === 'owner') entries.sort((a, b) => (a.owner || 'Shared').localeCompare(b.owner || 'Shared'));
  const rows = entries.map(entry => {
    const home = atHome(entry.name);
    const homeText = home ? `Home: ${formatQty(home.qty)}${home.unit === 'count' ? '' : ' ' + home.unit}` : 'None at home';
    const unit = entry.unit === 'count' ? '' : ' ' + entry.unit;
    return `
      <div class="row ${entry.done ? 'done' : ''}" data-id="${entry.id}">
        <button class="checkbox" data-action="toggle" aria-label="Check off">${entry.done ? '✓' : ''}</button>
        <div class="info">
          <div class="name">${entry.name}</div>
          <div class="meta"><span class="tag ${entry.owner === 'Shared' ? 'shared' : 'me'}">${entry.owner || 'Me'}</span>${formatQty(entry.qty)}${unit} · ${homeText}</div>
        </div>
      </div>`;
  }).join('');

  list.innerHTML = `<h2 class="section">To buy <span class="count">${data.shop.filter(entry => !entry.done).length}</span></h2><div class="card">${rows}</div>`;
}

document.getElementById('BodyShoppingList').addEventListener('click', (event) => {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;

  const entry = data.shop.find(
    candidate => candidate.id === Number(btn.closest('.row').dataset.id)
  );
  if(!entry) return;

  entry.done = !entry.done; 
  saveData();
  renderShop();
});
document.querySelector('#shopScreen .removeButton').addEventListener('click', () => {
  // add toast to both remove and add to inventory button for consistency
  if (!data.shop.some(entry => entry.done)) {
    showToast("Check an Item First!");
    return;
  }
  data.shop = data.shop.filter(entry => !entry.done);
  saveData();
  renderShop();
});

let itemAddToInventory = [];
document.querySelector('#shopScreen .addToInventory').addEventListener('click', () => {
  itemAddToInventory = data.shop.filter(entry => entry.done);
  if(!itemAddToInventory.length){
    showToast("Check an Item First!");
    return;
  }

  openFormItem();
});

function openFormItem(){
  const entry = itemAddToInventory[0];
  openItemForm({
    ...entry,
    // pre filled with fridge, prob more frequently used
    location: 'Fridge',
    allergen: 'None',
    expires: todayISO(7)
  }, true);
  document.getElementById('editingItemId').value = '';
  document.getElementById('addTitle').textContent = 'Add to Kitchen';
  document.getElementById('deleteItem').hidden = true;

}


const shopForm = document.getElementById('shopForm');
UNITS.forEach(unit => {
  shopForm.elements.unit.add(new Option(unit, unit));
});
document.querySelectorAll('#shopAdd, #shopAddBottom').forEach(button => {
  button.addEventListener('click', () => {
    shopForm.reset();
    document.getElementById('shopNameError').hidden = true;
    selectChoice('shopOwner', 'Me');
    shopForm.elements.unit.value = data.settings.defaultUnit;
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

  if (!name) {
    //replace toast with an error msg for consistency
    document.getElementById('shopNameError').hidden = false;
    fields.itemName.focus();
    return;
  }
  data.shop.push({
    id: Date.now(),
    name,
    qty: Number(fields.qty.value),
    unit: fields.unit.value,
    owner: selectedChoice('shopOwner'),
    done: false
  });
  saveData();
  renderShop();
  showScreen('shopScreen');
});

shopForm.addEventListener('reset', () => {
  selectChoice('shopOwner', 'Me');
  document.getElementById('shopNameError').hidden = true;
});


// Recipes
data.recipes ??= [];

const recipeForm = document.getElementById('recipeForm');
const ingredientInputs = document.getElementById('ingredientInputs');
const stepInputs = document.getElementById('stepInputs');
let editingRecipe = null;

function renderRecipes() {
  const list = document.getElementById('recipeList');
  list.replaceChildren();

  if (!data.recipes.length) {
    list.innerHTML = '<p class="empty-note">No recipes yet. Tap + to add one.</p>';
    return;
  }

  // same card and rows as  kitchen list for consistency
  const card = document.createElement('div');
  card.className = 'card';
  data.recipes.forEach(recipe => {
    const button = document.createElement('button');
    button.className = 'row';
    button.innerHTML = `
      <span class="name">${escapeText(recipe.title)}</span>
      <span class="tag">Serves ${recipe.servings}</span>
      <span class="tag">${recipe.minutes} min</span>`;
    button.onclick = () => openRecipe(recipe);
    card.append(button);
  });
  list.append(card);
}

function openRecipe(recipe = null) {
  editingRecipe = recipe;
  recipeForm.elements.title.value = recipe?.title ?? '';
  recipeForm.elements.servings.value = recipe?.servings ?? 3;
  recipeForm.elements.minutes.value = recipe?.minutes ?? 30;
  ingredientInputs.replaceChildren();
  stepInputs.replaceChildren();

  (recipe?.ingredients ?? [{}]).forEach(addRecipeIngredient);
  (recipe?.steps ?? ['']).forEach(addRecipeStep);
  document.getElementById('deleteRecipe').hidden = !recipe;
  showRecipeTab('ingredients');
  showScreen('recipeEditScreen');
}

function addRecipeIngredient(item = {}) {
  const row = document.createElement('div');
  row.className = 'recipe-row';
  row.innerHTML = `
    <input type="checkbox" aria-label="Add to shopping list">
    <input class="field text-input" placeholder="Ingredient" aria-label="Ingredient">
    <input class="field qty text-input number-input" aria-label="Quantity">
    <select class="field unit" aria-label="Unit"></select>`;
  row.children[1].value = item.name || '';
  row.children[2].value = item.qty || 1;
  fillDropdown(row.children[3], UNITS, item.unit || 'count');
  ingredientInputs.append(row);
}

function addRecipeStep(text = '') {
  const row = document.createElement('div');
  row.className = 'recipe-row';
  row.innerHTML = `
    <span class="step-number"></span>
    <textarea class="field text-input" placeholder="Write a step" aria-label="Step"></textarea>`;
  row.children[1].value = text;
  stepInputs.append(row);
}

recipeForm.addEventListener('submit', event => {
  event.preventDefault();
  // skip empty rows
  const rows = [...ingredientInputs.children].filter(row => row.children[1].value.trim());
  const addingToShop = event.submitter?.value === 'shop';

  if (addingToShop && !rows.some(row => row.children[0].checked)) {
    showToast('Check the ingredients you want to add.');
    return;
  }

  const recipe = {
    title: recipeForm.elements.title.value.trim(),
    servings: Number(recipeForm.elements.servings.value),
    minutes: Number(recipeForm.elements.minutes.value),
    ingredients: rows.map(row => ({
      name: row.children[1].value.trim(),
      qty: Number(row.children[2].value),
      unit: row.children[3].value.trim()
    })),
    // trim empt space and ignore empty steps
    steps: [...stepInputs.querySelectorAll('textarea')].map(input => input.value.trim()).filter(step => step)
  };

  if (editingRecipe) Object.assign(editingRecipe, recipe);
  else data.recipes.push(recipe);

  if (addingToShop) {
    let id = data.shop.reduce((max, item) => Math.max(max, item.id), Date.now());
    rows.forEach((row, index) => {
      if (row.children[0].checked) {
        data.shop.push({
          ...recipe.ingredients[index], id: ++id, owner: 'Me', done: false
        });
      }
    });
  }

  saveData();
  renderRecipes();
  if (addingToShop) renderShop();
  showScreen(addingToShop ? 'shopScreen' : 'recipesScreen');
});

renderRecipes();
document.getElementById('newRecipeButton').addEventListener('click', () => {
  openRecipe();
});

// People
let favoriteDraft = [];

function escapeText(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span.innerHTML.replace(/"/g, '&quot;');
}

function renderPeople() {
  const list = document.getElementById('peopleList');
  if (!data.people.length) {
    list.innerHTML = '<p class="empty-note">No household members yet. Tap + to add someone.</p>';
    return;
  }
  list.innerHTML = data.people.map(person => `
    <div class="row person-row" data-person-id="${person.id}">
      <button class="info" data-person-action="edit" aria-label="Edit ${escapeText(person.name)}">
        <div class="name">${escapeText(person.name)}</div>
        <div class="meta">${escapeText(person.allergies.length ? person.allergies.join(', ') : 'No allergies recorded')}</div>
        <div class="meta">${escapeText(person.diet === 'None' ? 'No dietary restrictions' : person.diet)}</div>
      </button>
      <button class="btn ghost" data-person-action="foods">View foods</button>
    </div>`).join('');
}

function addAllergyTag(allergy, checked) {
  const label = document.createElement('label');
  label.className = 'allergy-tag';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = allergy;
  checkbox.checked = checked;
  const text = document.createElement('span');
  text.textContent = allergy;
  label.append(checkbox, text);
  document.getElementById('personAllergies').appendChild(label);
}

function openPerson(person) {
  document.getElementById('personForm').reset();
  document.getElementById('personId').value = person ? person.id : '';
  document.getElementById('personTitle').textContent = person ? 'Edit Profile' : 'Add Person';
  document.getElementById('personName').value = person ? person.name : '';
  document.getElementById('personDiet').value = person ? person.diet : 'None';
  document.getElementById('deletePerson').hidden = !person;
  const allergies = person ? person.allergies : [];
  document.getElementById('personAllergies').innerHTML = '';
  document.getElementById('otherAllergyEntry').hidden = true;
  // The four common tags and + Other follow the Phase 1 profile sketch.
  const options = ['Peanuts', 'Dairy', 'Gluten', 'Fish'];
  allergies.forEach(allergy => { if (!options.includes(allergy)) options.push(allergy); });
  options.forEach(allergy => addAllergyTag(allergy, allergies.includes(allergy)));
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'more-allergies';
  more.textContent = '+ Other';
  more.addEventListener('click', () => {
    ALLERGENS.forEach(allergy => {
      if (allergy !== 'None' && !options.includes(allergy)) addAllergyTag(allergy, false);
    });
    document.getElementById('otherAllergyEntry').hidden = false;
    more.remove();
  });
  document.getElementById('personAllergies').appendChild(more);
  favoriteDraft = person ? [...person.favorites] : [];
  renderFavorites();
  document.getElementById('personForm').scrollTop = 0;
  showScreen('personScreen');
}

function renderFavorites() {
  const list = document.getElementById('personFavorites');
  list.innerHTML = '';
  favoriteDraft.forEach((favorite, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'favorite-tag';
    button.textContent = favorite + ' ×';
    button.setAttribute('aria-label', 'Remove favorite ' + favorite);
    button.addEventListener('click', () => {
      favoriteDraft.splice(index, 1);
      renderFavorites();
    });
    list.appendChild(button);
  });
}

document.getElementById('addPerson').addEventListener('click', () => openPerson(null));
document.getElementById('personBack').addEventListener('click', () => showScreen('peopleScreen'));
document.getElementById('foodsBack').addEventListener('click', () => showScreen('peopleScreen'));
document.getElementById('peopleList').addEventListener('click', event => {
  const button = event.target.closest('[data-person-action]');
  if (!button) return;
  const id = Number(button.closest('[data-person-id]').dataset.personId);
  const person = data.people.find(member => member.id === id);
  if (button.dataset.personAction === 'edit') openPerson(person);
  else showPersonFoods(person);
});

document.getElementById('addAllergy').addEventListener('click', () => {
  const input = document.getElementById('otherAllergy');
  const name = input.value.trim();
  if (!name) { showToast('Enter an allergen first'); return; }
  if (name.toLowerCase() === 'none') { showToast('Leave tags unchecked for no allergies'); return; }
  const existing = [...document.querySelectorAll('#personAllergies input')].find(box => box.value.toLowerCase() === name.toLowerCase());
  if (existing) existing.checked = true;
  else addAllergyTag(name, true);
  input.value = '';
  input.blur();
});

document.getElementById('addFavorite').addEventListener('click', () => {
  const input = document.getElementById('favoriteInput');
  const name = input.value.trim();
  if (!name) { showToast('Enter a favorite first'); return; }
  if (!favoriteDraft.some(favorite => favorite.toLowerCase() === name.toLowerCase())) favoriteDraft.push(name);
  input.value = '';
  input.blur();
  renderFavorites();
});

// Enter adds the typed tag instead of submitting the whole profile.
document.getElementById('otherAllergy').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); document.getElementById('addAllergy').click(); }
});
document.getElementById('favoriteInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); document.getElementById('addFavorite').click(); }
});

document.getElementById('personForm').addEventListener('submit', event => {
  event.preventDefault();
  const nameInput = document.getElementById('personName');
  const name = nameInput.value.trim();
  const id = Number(document.getElementById('personId').value);
  if (!name) { showToast('Enter a name first'); nameInput.focus(); return; }
  if (data.people.some(person => person.id !== id && person.name.toLowerCase() === name.toLowerCase())) {
    showToast('That name is already in your household');
    return;
  }
  const person = {
    id: id || nextId(), name,
    allergies: [...document.querySelectorAll('#personAllergies input:checked')].map(box => box.value),
    diet: document.getElementById('personDiet').value,
    favorites: [...favoriteDraft],
  };
  if (id) data.people[data.people.findIndex(member => member.id === id)] = person;
  else data.people.push(person);
  saveData();
  showScreen('peopleScreen');
  showToast(name + ' saved');
});

document.getElementById('resetPerson').addEventListener('click', () => {
  const id = Number(document.getElementById('personId').value);
  openPerson(data.people.find(person => person.id === id));
});

document.getElementById('deletePerson').addEventListener('click', () => {
  const id = Number(document.getElementById('personId').value);
  const person = data.people.find(member => member.id === id);
  openModal('Remove ' + person.name + '?', 'This removes their profile and food preferences.', [
    {
      label: 'Remove', primary: true, onClick: () => {
        data.people = data.people.filter(member => member.id !== id);
        saveData();
        showScreen('peopleScreen');
        showToast('Member removed');
      }
    },
    { label: 'Cancel', onClick: () => { } },
  ]);
});

function showPersonFoods(person) {
  const excluded = person.allergies.map(allergy => allergy.toLowerCase());
  const items = data.items.filter(item => item.qty > 0 && !excluded.includes(item.allergen.toLowerCase()));
  document.getElementById('foodsDescription').textContent = person.name + ': ' +
    (excluded.length ? 'excluding ' + person.allergies.join(', ') + '. ' : 'No allergies recorded. ') +
    'Based on recorded item allergens only; dietary restrictions are saved separately.';
  document.getElementById('personFoods').innerHTML = items.length ? items.map(item => `
    <div class="row settings-row">
      <div class="name">${escapeText(item.name)}</div>
      <div class="meta">${escapeText(item.location)} · ${formatQty(item.qty)} ${escapeText(item.unit)}</div>
    </div>`).join('') : '<p class="empty-note">No in-stock items match these preferences.</p>';
  showScreen('personFoodsScreen');
}

// Settings
fillDropdown(document.getElementById('defaultUnit'), UNITS, data.settings.defaultUnit);

function fillSettings() {
  document.getElementById('defaultUnit').value = data.settings.defaultUnit;
  document.getElementById('shopOrder').value = data.settings.shopOrder;
  document.getElementById('reminderEnabled').checked = data.settings.reminder;
  document.getElementById('reminderDay').value = data.settings.reminderDay;
  document.getElementById('reminderTime').value = data.settings.reminderTime;
  toggleReminderFields();
}

function toggleReminderFields() {
  const enabled = document.getElementById('reminderEnabled').checked;
  document.getElementById('reminderDay').disabled = !enabled;
  document.getElementById('reminderTime').disabled = !enabled;
}

function renderReminder() {
  const now = new Date();
  const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  document.getElementById('shoppingReminder').hidden = !(data.settings.reminder &&
    Number(data.settings.reminderDay) === now.getDay() && time >= data.settings.reminderTime &&
    data.settings.reminderDismissed !== now.toDateString());
}

document.getElementById('reminderEnabled').addEventListener('change', toggleReminderFields);
document.getElementById('resetSettings').addEventListener('click', fillSettings);
document.getElementById('householdSettings').addEventListener('click', () => showScreen('peopleScreen'));
document.getElementById('shoppingReminder').addEventListener('click', () => {
  // hide the reminder until the next occurence once it's tapped
  data.settings.reminderDismissed = new Date().toDateString();
  saveData();
  showScreen('shopScreen');
});
document.getElementById('settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  data.settings = {
    defaultUnit: document.getElementById('defaultUnit').value,
    shopOrder: document.getElementById('shopOrder').value,
    reminder: document.getElementById('reminderEnabled').checked,
    reminderDay: document.getElementById('reminderDay').value,
    reminderTime: document.getElementById('reminderTime').value,
  };
  saveData();
  renderShop();
  showScreen('kitchenScreen');
  showToast('Settings saved');
});

document.getElementById('resetDataButton').addEventListener('click', () => {
  openModal('Reset demo data?', 'Your kitchen, shopping list, people and settings will be replaced with the samples.', [
    {
      label: 'Reset', primary: true, onClick: () => {
        data = seedData();
        saveData();
        renderKitchen();
        renderShop();
        renderRecipes();
        showScreen('kitchenScreen');
        showToast('Demo data restored');
      }
    },
    { label: 'Cancel', onClick: () => { } },
  ]);
});

// On-screen keyboard image
function showKeyboard() {
  const keyboard = document.getElementById('keyboard');
  // normal keyboard or numpad based on focused element requiring num input or not
  keyboard.src = document.activeElement.classList.contains('number-input') ? 'icons/keyboard-numbers.png' : 'icons/keyboard.png';
  keyboard.hidden = false;
  document.getElementById('device').classList.add('keyboard-open');
  const form = document.activeElement?.closest('form');
  const actions = form?.querySelector('.actions');
  if (actions) actions.scrollIntoView({ block: 'nearest' });
  // scrolls to the row when numpad is open, ensuring the item is not hidden by the numpad
  const target = document.activeElement.closest('.row') || document.activeElement;
  target.scrollIntoView({ block: 'nearest' });
}

function hideKeyboard() {
  document.getElementById('keyboard').hidden = true;
  document.getElementById('device').classList.remove('keyboard-open');
}

document.addEventListener('focusin', (event) => {
  if (event.target.classList.contains('text-input')) showKeyboard();
});
document.addEventListener('focusout', (event) => {
  // tapping on save while keyboard is open saves it in one go, do not need to tap to hide keyboard and then tap to save itm
  if (!event.target.classList.contains('text-input')) return;
  document.addEventListener('click', () => {
    if (!document.activeElement.classList.contains('text-input')) hideKeyboard();
  }, { once: true });
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.classList.contains('text-input')) {
    event.target.blur();
    hideKeyboard();
  }
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
renderReminder();

// quantity allowed is up to 3 digits (123), or up to 2 digits with one decimal (12.5)
document.addEventListener('input', (event) => {
  if (!event.target.classList.contains('number-input')) return;
  // matches digits 0-9, either 1 or 2 digits maybe followed by decimal with 1 digit, or 3 digits with no decimal point
  event.target.value = event.target.value.match(/^(\d{1,2}\.\d?|\d{0,3})/)[0];
});

function showRecipeTab(tab) {
  document.getElementById('ingredients').hidden = tab !== 'ingredients';
  document.getElementById('steps').hidden = tab !== 'steps';
  const buttons = document.querySelectorAll('#recipeTabs button');
  buttons[0].classList.toggle('active', tab === 'ingredients');
  buttons[1].classList.toggle('active', tab === 'steps');
}

// removes the checked ingredients, similr to Remove on the shopping list
function removeCheckedIngredients() {
  const checked = [...ingredientInputs.children].filter(row => row.children[0].checked);
  if (!checked.length) {
    showToast('Check an Item First!');
    return;
  }
  checked.forEach(row => row.remove());
}

function removeLastStep() {
  if (stepInputs.lastElementChild) stepInputs.lastElementChild.remove();
}

function removeRecipe() {
  openModal(`Remove ${editingRecipe.title}?`, '', [
    {
      label: 'Remove', primary: true, onClick: () => {
        data.recipes = data.recipes.filter(recipe => recipe !== editingRecipe);
        saveData();
        renderRecipes();
        showScreen('recipesScreen');
        showToast(`${editingRecipe.title} removed`);
      }
    },
    { label: 'Cancel', onClick: () => { } },
  ]);
}
