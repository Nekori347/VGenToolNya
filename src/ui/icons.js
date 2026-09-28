// Shared SVG icon helpers (Feather-style stroke icons, MIT licensed). Used
// across VGenToolNya UI to replace emoji / unicode placeholder glyphs with a
// consistent, theme-adaptive icon set.

const PATHS = Object.freeze({
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    chevronUp: '<polyline points="18 15 12 9 6 15"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>',
    arrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    arrowDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
});

export function iconSvg(name, size = 16) {
    const body = PATHS[name];
    if (!body) return '';
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Replaces a button's text glyph with an SVG icon. Keeps data-action intact;
// an optional label is rendered as a visually-hidden screen-reader span.
export function setButtonIcon(button, name, { size = 15, label = '' } = {}) {
    if (!button) return button;
    button.innerHTML = iconSvg(name, size);
    if (label && button.ownerDocument?.createElement) {
        const span = button.ownerDocument.createElement('span');
        span.className = 'vgn-sr-only';
        span.textContent = label;
        button.append(span);
    }
    return button;
}
