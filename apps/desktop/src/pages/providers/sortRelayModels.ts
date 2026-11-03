const modelNameCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const NUMERIC_TOKEN = /^\d+$/;

function modelTokens(model: string): string[] {
  // Provider namespaces should not separate variants of the same model family.
  const name = model.trim().split("/").pop() ?? model;
  return name.toLowerCase().match(/\d+|[^\d\s._-]+/g) ?? [];
}

function compareToken(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0;
  if (left === undefined) return NUMERIC_TOKEN.test(right ?? "") ? 1 : -1;
  if (right === undefined) return NUMERIC_TOKEN.test(left) ? -1 : 1;
  const leftIsNumber = NUMERIC_TOKEN.test(left);
  const rightIsNumber = NUMERIC_TOKEN.test(right);
  if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
  const order = modelNameCollator.compare(left, right);
  return leftIsNumber ? -order : order;
}

function compareTokens(left: string[], right: string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const order = compareToken(left[index], right[index]);
    if (order) return order;
  }
  return 0;
}

/** Group model families, order versions newest first and keep original model identifiers. */
export function sortRelayModels(models: readonly string[]): string[] {
  return models.map((model) => ({ model, tokens: modelTokens(model) }))
    .sort((left, right) => compareTokens(left.tokens, right.tokens)
      || modelNameCollator.compare(left.model, right.model))
    .map(({ model }) => model);
}
