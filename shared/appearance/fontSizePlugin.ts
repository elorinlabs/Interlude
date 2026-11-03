import type { Plugin } from 'postcss';

/** Scale existing pixel typography without changing spacing, images or viewport geometry. */
export function fontSizePlugin(): Plugin {
  return {
    postcssPlugin: 'remoteai-font-size',
    Declaration(declaration) {
      if (!['font-size', 'line-height', 'font'].includes(declaration.prop)) return;
      const value = declaration.value;
      // Relative sizes already inherit scaling; GUI variables carry the chosen absolute size.
      if (value.includes('var(')) return;
      declaration.value = value.replace(/(?<![\w.-])(\d*\.?\d+)px\b/g,
        (size) => `calc(${size} * var(--app-font-scale, 1))`);
    },
  };
}
