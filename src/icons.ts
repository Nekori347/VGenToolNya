export const iconPaths:Record<string,string>={
 refresh:'<path d="M13 5.5A5.5 5.5 0 1 0 13.2 10"/><path d="M10.4 3.2H13v2.6"/>',
 more:'<circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/>',
 collapse:'<path d="m4 6 4 4 4-4"/>',
 settings:'<path d="m6 2 1-1h2l1 2 2 1h2v3l-1 1 1 2-1 2h-2l-2 2H6l-1-2-2-1H1V8l1-1V4h2Z"/><circle cx="8" cy="8" r="2.5"/>',
 add:'<path d="M8 3v10M3 8h10"/>',
 note:'<path d="M3 2h8l2 2v10H3Z"/><path d="M5 6h6M5 9h6M5 12h3"/>',
 translate:'<path d="M1 3h8M5 1v2M3 4c0 3 3 5 5 6M8 4c-1 3-3 5-6 6M9 14l3-8 3 8M10 12h4"/>',
 undo:'<path d="m5 3-3 3 3 3M2 6h7a4 4 0 1 1 0 8H7"/>',
 chat:'<path d="M2 2h12v9H7l-4 3v-3H2Z"/>',
 close:'<path d="m4 4 8 8M12 4l-8 8"/>',
};
export function setIcon(button:HTMLElement,name:string,label:string){button.innerHTML=`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.settings}</svg>`;button.setAttribute('aria-label',label);button.title=label;return button}
