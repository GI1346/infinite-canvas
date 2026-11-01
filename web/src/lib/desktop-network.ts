declare global {
    interface Window { blinkflowNetwork?: { readonly proxyUrl: string } }
}

export function desktopProxyUrl() {
    return typeof window === "undefined" ? "" : window.blinkflowNetwork?.proxyUrl || "";
}
