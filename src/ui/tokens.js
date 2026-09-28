// Shared design tokens for VGenToolNya. Modules inject this once (or rely on
// the settings/panel shells that already inject it) and reference the --vgn-*
// custom properties instead of hardcoding colors / spacing. Tokens are scoped
// to :root with a --vgn- prefix to avoid clobbering the host page.

export const UI_TOKENS_CSS = `
:root{
--vgn-space-1:4px;--vgn-space-2:6px;--vgn-space-3:8px;--vgn-space-4:12px;--vgn-space-5:16px;
--vgn-radius-sm:6px;--vgn-radius-md:8px;--vgn-radius-lg:10px;--vgn-radius-xl:12px;
--vgn-font-xs:11px;--vgn-font-sm:12px;--vgn-font-md:13px;--vgn-font-lg:14px;
--vgn-accent:#3b82f6;--vgn-accent-strong:#145dab;--vgn-accent-soft:#dbeafe;
--vgn-success:#10b981;--vgn-success-strong:#3bdfbc;
--vgn-danger:#ef4444;--vgn-danger-strong:#b42318;--vgn-danger-soft:#ff6476;
--vgn-warning:#f59e0b;--vgn-warning-strong:#b45309;
--vgn-surface:#ffffff;--vgn-surface-2:#f6f7f8;--vgn-surface-3:#fafafa;
--vgn-text:#242424;--vgn-text-muted:#667085;--vgn-border:#dddddd;--vgn-border-2:#e4e5e7;
--vgn-control:#f3f4f6;--vgn-control-hover:#e5e7eb;
}
@media (prefers-color-scheme:dark){
:root{
--vgn-surface:#1f2328;--vgn-surface-2:#262b31;--vgn-surface-3:#2c3138;
--vgn-text:#e8eaed;--vgn-text-muted:#9aa0a6;--vgn-border:#3c4043;--vgn-border-2:#34383c;
--vgn-control:#2c3138;--vgn-control-hover:#363b42;--vgn-accent-soft:#16324d;
}
}
.vgn-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
`;
