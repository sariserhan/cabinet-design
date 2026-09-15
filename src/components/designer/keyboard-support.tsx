'use client';
import { useEffect } from 'react';
export function DesignerKeyboardSupport() {
  useEffect(() => {
    const root = document.querySelector('.designer-app');
    if (!root) return;
    function update() {
      root?.querySelectorAll('[role="tablist"]').forEach((list) => {
        const tabs = Array.from(
          list.querySelectorAll<HTMLElement>('[role="tab"]'),
        );
        const selected =
          tabs.find((t) => t.getAttribute('aria-selected') === 'true') ??
          tabs[0];
        tabs.forEach((t) => {
          t.tabIndex = t === selected ? 0 : -1;
        });
      });
    }
    function key(event: Event) {
      const e = event as KeyboardEvent;
      const target = e.target;
      if (
        !(target instanceof HTMLElement) ||
        target.getAttribute('role') !== 'tab' ||
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
        ].includes(e.key)
      )
        return;
      const list = target.closest('[role="tablist"]');
      if (!list) return;
      const tabs = Array.from(
        list.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      ).filter((t) => !t.disabled);
      const index = tabs.indexOf(target as HTMLButtonElement);
      const next =
        e.key === 'Home'
          ? tabs[0]
          : e.key === 'End'
            ? tabs[tabs.length - 1]
            : tabs[
                (index +
                  (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1) +
                  tabs.length) %
                  tabs.length
              ];
      if (next) {
        e.preventDefault();
        e.stopPropagation();
        next.click();
        next.focus();
        update();
      }
    }
    update();
    root.addEventListener('keydown', key);
    const observer = new MutationObserver(update);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    });
    return () => {
      observer.disconnect();
      root.removeEventListener('keydown', key);
    };
  }, []);
  return null;
}
