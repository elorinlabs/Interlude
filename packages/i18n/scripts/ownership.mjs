import ts from 'typescript';

const languages = new Set(['zh', 'en', 'ru', 'ja']);
const languageCondition = /\b(language|locale|lang|zh|isZh|isEn|isRu|isJa|isChinese|isEnglish|isRussian|isJapanese)\b/;
const translatedCharacters = /[\p{Script=Han}\p{Script=Cyrillic}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const prose = /[A-Za-z]{2,} [A-Za-z]{2,}/;
export const keyArguments = { t: 0, uiText: 0, displayText: 0, translateMessage: 1, msg: 0, label: 0 };

/** Native template tables also belong to generated platform resources. */
export function nativeTranslationTables(code) {
  const names = new Map();
  for (const match of code.matchAll(/\bconst\s+(\w+)_(ZH|EN|RU|JA)\s*:/g)) {
    const locales = names.get(match[1]) ?? new Set();
    locales.add(match[2]);
    names.set(match[1], locales);
  }
  return [...names].filter(([, locales]) => locales.size > 1).map(([name]) => name);
}

function unwrapped(node) {
  return node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isSatisfiesExpression(node)) ? unwrapped(node.expression) : node;
}

/** Find literal labels hidden behind tuple destructuring in common presentation maps. */
export function mappedKeyViolations(source) {
  const arrays = new Map();
  const errors = new Set();
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const value = unwrapped(node.initializer);
      if (value && ts.isArrayLiteralExpression(value)) arrays.set(node.name.text, value);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'map') {
      const receiver = node.expression.expression;
      const array = ts.isIdentifier(receiver) ? arrays.get(receiver.text) : unwrapped(receiver);
      const callback = node.arguments[0];
      if (array && ts.isArrayLiteralExpression(array) && callback && ts.isArrowFunction(callback)) {
        checkMappedLabels(array, callback, errors);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...errors];
}

function checkMappedLabels(array, callback, errors) {
  const names = callback.parameters[0]?.name;
  if (!names || !ts.isArrayBindingPattern(names)) return;
  names.elements.forEach((binding, index) => {
    if (!ts.isBindingElement(binding) || !ts.isIdentifier(binding.name)) return;
    const labels = array.elements.flatMap(row => {
      const label = ts.isArrayLiteralExpression(row) ? row.elements[index] : undefined;
      return label && ts.isStringLiteralLike(label) && translatedCharacters.test(label.text) ? [label] : [];
    });
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && Object.hasOwn(keyArguments, node.expression.text)) {
        let arg = node.arguments[keyArguments[node.expression.text]];
        if (arg && ts.isCallExpression(arg) && arg.expression.getText() === 'String') arg = arg.arguments[0];
        if (arg && ts.isIdentifier(arg) && arg.text === binding.name.text) {
          labels.forEach(label => errors.add(label));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(callback.body);
  });
}

function textLeaves(node) {
  if (!node) return [];
  if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) return [node];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isJsxExpression(node)) {
    return textLeaves(node.expression);
  }
  if (ts.isConditionalExpression(node)) return [...textLeaves(node.whenTrue), ...textLeaves(node.whenFalse)];
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap(property => ts.isPropertyAssignment(property) ? textLeaves(property.initializer) : []);
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(textLeaves);
  if (ts.isBinaryExpression(node)) return [...textLeaves(node.left), ...textLeaves(node.right)];
  if (ts.isCallExpression(node)) {
    // Explicit wire values are deliberately displayed verbatim, never translated.
    return node.expression.getText() === 'verbatim' ? [] : node.arguments.flatMap(textLeaves);
  }
  if (ts.isReturnStatement(node)) return textLeaves(node.expression);
  if (ts.isBlock(node)) return node.statements.flatMap(textLeaves);
  return [];
}

function isLanguageCondition(node) {
  const condition = node.getText();
  if (!languageCondition.test(condition)) return false;
  // Build plugins also have a programming-language field (for example Kotlin).
  const literals = condition.match(/["']([^"']+)["']/g) ?? [];
  return !literals.length || literals.some(value => /^["'](?:zh|en|ru|ja)(?:[-_][A-Za-z]+)?["']$/.test(value));
}

const hasCopy = leaf => translatedCharacters.test(leaf.getText()) || prose.test(leaf.getText());

/** Presentation copy and interpolation fragments must not bypass semantic message lookup. */
export function presentationViolations(source) {
  const errors = new Set();
  const visit = node => {
    if (ts.isJsxText(node) && translatedCharacters.test(node.text)) errors.add(node);
    if (source.fileName.endsWith('.tsx') && ts.isPropertyAssignment(node)
      && /^(?:title|label|placeholder|tooltip)$/.test(node.name.getText())) {
      textLeaves(node.initializer).filter(leaf => translatedCharacters.test(leaf.getText()))
        .forEach(leaf => errors.add(leaf));
    }
    if (ts.isJsxAttribute(node)
      && /^(?:title|placeholder|aria-label|alt|accessibilityLabel|accessibilityHint)$/.test(node.name.getText())) {
      textLeaves(node.initializer).filter(leaf => translatedCharacters.test(leaf.getText()))
        .forEach(leaf => errors.add(leaf));
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && Object.hasOwn(keyArguments, node.expression.text)) {
      const values = node.arguments[keyArguments[node.expression.text] + 1];
      textLeaves(values).filter(leaf => translatedCharacters.test(leaf.getText())).forEach(leaf => errors.add(leaf));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...errors];
}

function isBilingualTuple(node) {
  if (!ts.isArrayLiteralExpression(node) || node.elements.length !== 2) return false;
  if (!node.elements.every(ts.isStringLiteralLike)) return false;
  const texts = node.elements.map(element => element.text);
  return texts.some(text => translatedCharacters.test(text))
    && texts.some(text => !translatedCharacters.test(text) && /^[A-Z][a-z]+(?: |$)/.test(text));
}

/** Catch dictionaries and inline language branches without flagging locale adapters or user-provided content. */
export function translationViolations(source) {
  const errors = [];
  const visit = node => {
    if (isBilingualTuple(node)) errors.push(node);
    if (ts.isObjectLiteralExpression(node)) {
      const entries = node.properties.filter(property => ts.isPropertyAssignment(property)
        && languages.has(property.name.getText(source).replace(/["']/g, '')));
      if (entries.length >= 2 && entries.some(entry => textLeaves(entry.initializer).some(hasCopy))) errors.push(node);
    }
    if (ts.isConditionalExpression(node) && isLanguageCondition(node.condition)) {
      const leaves = [...textLeaves(node.whenTrue), ...textLeaves(node.whenFalse)];
      if (leaves.some(hasCopy)) errors.push(node);
    }
    if (ts.isIfStatement(node) && isLanguageCondition(node.expression)) {
      const leaves = [...textLeaves(node.thenStatement), ...textLeaves(node.elseStatement)];
      if (leaves.some(hasCopy)) errors.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return errors;
}
