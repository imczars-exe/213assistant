'use strict';

// Controles temáticos.
//
// Regla de la app: ningún control se queda con el aspecto por defecto del
// navegador. Los <select> se resuelven solo con CSS (ver "CONTROLES
// TEMÁTICOS" en styles.css). Este archivo se encarga de los <input list="...">,
// cuyo desplegable de sugerencias (datalist) es nativo y no se puede
// estilizar: se reemplaza por un panel propio, con la misma apariencia que la
// lista de los select. Funciona con cualquier input con atributo `list`,
// existente o agregado después, sin tocar nada más.

(() => {
  const panel = document.createElement('div');
  panel.className = 'combo-panel';
  panel.setAttribute('role', 'listbox');
  panel.hidden = true;
  document.body.appendChild(panel);

  let activeInput = null;
  let visibleItems = [];
  let activeIndex = -1;

  function allOptions(input) {
    const list = document.getElementById(input.dataset.comboList);
    if (!list) return [];
    return Array.from(list.options)
      .map((option) => option.value)
      .filter(Boolean);
  }

  function place(input) {
    const rect = input.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.width = `${rect.width}px`;
  }

  function setActive(index) {
    activeIndex = index;
    Array.from(panel.children).forEach((el, i) => {
      el.dataset.active = String(i === index);
      if (i === index) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function close() {
    panel.hidden = true;
    activeInput = null;
    visibleItems = [];
    activeIndex = -1;
  }

  function choose(value) {
    if (!activeInput) return;
    const input = activeInput;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  }

  function render(input) {
    const typed = input.value.trim().toLowerCase();
    const options = allOptions(input);
    // Si lo escrito ya es exactamente una de las opciones (p. ej. tras elegir
    // una), se muestran todas, para poder cambiar de opinión sin borrar.
    const isExact = options.some((value) => value.toLowerCase() === typed);
    visibleItems = options.filter((value) => !typed || isExact || value.toLowerCase().includes(typed));
    if (!visibleItems.length) {
      close();
      return;
    }
    activeInput = input;
    panel.replaceChildren(
      ...visibleItems.map((value) => {
        const item = document.createElement('div');
        item.className = 'combo-option';
        item.setAttribute('role', 'option');
        item.textContent = value;
        // mousedown (y no click) para elegir antes de que el input pierda el foco
        item.addEventListener('mousedown', (evt) => {
          evt.preventDefault();
          choose(value);
        });
        return item;
      })
    );
    place(input);
    panel.hidden = false;
    setActive(-1);
  }

  function enhance(input) {
    if (input.dataset.comboList) return;
    input.dataset.comboList = input.getAttribute('list');
    // Sin el atributo `list` el navegador no muestra su desplegable nativo.
    input.removeAttribute('list');

    input.addEventListener('focus', () => render(input));
    input.addEventListener('click', () => render(input));
    input.addEventListener('input', () => render(input));
    input.addEventListener('blur', () => {
      if (activeInput === input) close();
    });
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
        if (panel.hidden || activeInput !== input) render(input);
        if (!visibleItems.length) return;
        evt.preventDefault();
        const step = evt.key === 'ArrowDown' ? 1 : -1;
        setActive((activeIndex + step + visibleItems.length) % visibleItems.length);
      } else if (evt.key === 'Enter' && !panel.hidden && activeIndex >= 0) {
        evt.preventDefault();
        choose(visibleItems[activeIndex]);
      } else if (evt.key === 'Escape' && !panel.hidden) {
        // Cierra solo el panel, no el modal que lo contiene.
        evt.preventDefault();
        evt.stopPropagation();
        close();
      }
    });
  }

  const enhanceAll = (root) => {
    if (root.matches && root.matches('input[list]')) enhance(root);
    if (root.querySelectorAll) root.querySelectorAll('input[list]').forEach(enhance);
  };

  enhanceAll(document);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach((node) => node.nodeType === 1 && enhanceAll(node));
  }).observe(document.body, { childList: true, subtree: true });

  // Clicar en el panel (incluida su barra de desplazamiento) no debe quitarle
  // el foco al input.
  panel.addEventListener('mousedown', (evt) => evt.preventDefault());

  // Si la ventana cambia o algo se desplaza, el panel ya no está bien
  // ubicado (salvo que sea el propio panel el que se desplaza).
  window.addEventListener('resize', close);
  document.addEventListener(
    'scroll',
    (evt) => {
      if (panel.contains(evt.target)) return;
      close();
    },
    true
  );
})();
