/**
 * Custom Preact render utility for testing.
 *
 * @testing-library/preact's CJS require("preact") bypasses Vitest's resolve
 * aliases, loading a separate preact instance (source files with unmangled
 * property names) while our code uses the aliased dist preact (mangled).
 * This dual-instance causes hooks to break because `options._render` is set
 * on one options object but read from another.
 *
 * This helper uses native preact render + @testing-library/dom queries.
 */
import { render as preactRender, h } from 'preact';
import { act } from 'preact/test-utils';
import { getQueriesForElement, prettyDOM } from '@testing-library/dom';

const mountedContainers = new Set();

function render(ui, { container, baseElement, wrapper: WrapperComponent } = {}) {
  if (!baseElement) {
    baseElement = document.body;
  }

  if (!container) {
    container = baseElement.appendChild(document.createElement('div'));
  }

  mountedContainers.add(container);

  const wrapUiIfNeeded = (innerElement) =>
    WrapperComponent ? h(WrapperComponent, null, innerElement) : innerElement;

  act(() => {
    preactRender(wrapUiIfNeeded(ui), container);
  });

  return {
    container,
    baseElement,
    debug: (el = baseElement, maxLength, options) =>
      Array.isArray(el)
        ? el.forEach((e) => console.log(prettyDOM(e, maxLength, options)))
        : console.log(prettyDOM(el, maxLength, options)),
    unmount: () => {
      act(() => {
        preactRender(null, container);
      });
    },
    rerender: (rerenderUi) => {
      act(() => {
        preactRender(wrapUiIfNeeded(rerenderUi), container);
      });
    },
    asFragment: () => {
      // Return a DocumentFragment clone of the container's children
      const fragment = document.createDocumentFragment();
      Array.from(container.childNodes).forEach((node) => {
        fragment.appendChild(node.cloneNode(true));
      });
      return fragment;
    },
    ...getQueriesForElement(container)
  };
}

function cleanup() {
  mountedContainers.forEach((container) => {
    act(() => {
      preactRender(null, container);
    });
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    mountedContainers.delete(container);
  });
}

// Re-export everything from @testing-library/dom
export * from '@testing-library/dom';
export { render, cleanup, act };
