const LOCATIONS = ['Fridge', 'Freezer', 'Pantry'];
const UNITS = ['count', 'oz', 'lb', 'cups', 'gal', 'loaf', 'bag', 'slices', 'box'];
const ALLERGENS = ['None', 'Dairy', 'Eggs', 'Peanuts', 'Tree nuts', 'Gluten', 'Soy', 'Fish', 'Shellfish'];

// How much one tap of − / + changes an item, by unit
const STEP_SIZE = { count: 1, oz: 4, lb: 0.5, cups: 0.5, gal: 0.25, loaf: 1, bag: 1, slices: 1, box: 1 };
const DEFAULT_SHOP_QTY = { count: 1, oz: 16, lb: 1, cups: 1, gal: 1, loaf: 1, bag: 1, slices: 8, box: 1 };

function todayISO(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (offsetDays || 0));
  return d.toISOString().slice(0, 10);
}

function seedData() {
  let n = 1;
  function makeItem(name, qty, unit, location, owner, days, allergen = 'None') {
    return {
      id: n++,
      name: name,
      qty: qty,
      unit: unit,
      location: location,
      owner: owner,
      expires: todayISO(days),
      allergen: allergen
    };
  }
  return {
    items: [
      makeItem('Milk', 12, 'oz', 'Fridge', 'Me', 1, 'Dairy'),
      makeItem('Eggs', 3, 'count', 'Fridge', 'Shared', 2, 'Eggs'),
      makeItem('Chicken thighs', 2, 'lb', 'Fridge', 'Me', 4),
      makeItem('Greek yogurt', 4, 'count', 'Fridge', 'Me', 9, 'Dairy'),
      makeItem('Tomatoes', 6, 'count', 'Fridge', 'Shared', 6),
      makeItem('Orange juice', 0.5, 'gal', 'Fridge', 'Me', 7),
      makeItem('Frozen peas', 1, 'bag', 'Freezer', 'Shared', 120),
      makeItem('Naan', 6, 'count', 'Freezer', 'Shared', 60, 'Gluten'),
      makeItem('Rice', 5, 'lb', 'Pantry', 'Shared', 365),
      makeItem('Pasta', 2, 'box', 'Pantry', 'Shared', 300, 'Gluten'),
      makeItem('Peanut butter', 16, 'oz', 'Pantry', 'Me', 150, 'Peanuts'),
      makeItem('Bread', 1, 'loaf', 'Pantry', 'Shared', 5, 'Gluten'),
      makeItem('Onions', 3, 'count', 'Pantry', 'Shared', 14),
    ],
    shop: [
      { id: 101, name: 'Chana (chickpeas)', qty: 2, unit: 'count', done: false },
      { id: 102, name: 'Onions', qty: 3, unit: 'count', done: false },
    ],
  };
}
