const pluralCategories = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
export const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();

export function messageParams(message) {
  const texts = typeof message === 'string' ? [message] : Object.values(message);
  const names = new Set(texts.flatMap(placeholders));
  if (typeof message !== 'string') names.add('count');
  return [...names].sort();
}

function checkShape(message, label, errors) {
  if (typeof message === 'string') {
    if (!message.trim()) errors.push(`${label}: empty translation`);
    return;
  }
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.other !== 'string') {
    errors.push(`${label}: a plural message must contain other`);
    return;
  }
  for (const [category, text] of Object.entries(message)) {
    if (!pluralCategories.has(category) && !/^=-?\d+(\.\d+)?$/.test(category)) errors.push(`${label}: invalid plural category`);
    if (typeof text !== 'string' || !text.trim()) errors.push(`${label}: invalid plural text`);
  }
}

/** Missing draft entries may fall back; supplied draft entries still have to be correct. */
export function validateCatalog({ base, target, label, released, locale }) {
  const errors = [];
  for (const key of Object.keys(target)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(key)) errors.push(`${label}/${key}: use a semantic key`);
  }
  for (const [key, value] of Object.entries(target)) checkShape(value, `${label}/${key}`, errors);
  if (errors.length) return errors;
  for (const [key, original] of Object.entries(base)) {
    if (!Object.hasOwn(target, key)) {
      if (released) errors.push(`${label}/${key}: missing translation`);
      continue;
    }
    const translated = target[key];
    if (typeof original !== typeof translated) errors.push(`${label}/${key}: message kind changed`);
    const expected = messageParams(original).join(',');
    const variants = typeof translated === 'string' ? [translated] : Object.values(translated);
    for (const variant of variants) {
      const actual = new Set(placeholders(variant));
      if (typeof translated !== 'string') actual.add('count');
      if ([...actual].sort().join(',') !== expected) errors.push(`${label}/${key}: placeholders differ`);
    }
    if (typeof translated === 'string') continue;
    const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
    for (const category of categories) {
      if (!Object.hasOwn(translated, category)) errors.push(`${label}/${key}: missing plural category ${category}`);
    }
  }
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(base, key)) errors.push(`${label}/${key}: unknown translation key`);
  }
  return errors;
}
