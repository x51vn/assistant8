/// <reference types="chrome" />

/**
 * CSS module side-effect imports
 * Allows `import './foo.css'` without TypeScript errors
 */
declare module '*.css' {
  const stylesheet: Record<string, string>;
  export default stylesheet;
}

/**
 * SVG imports
 */
declare module '*.svg' {
  const src: string;
  export default src;
}
