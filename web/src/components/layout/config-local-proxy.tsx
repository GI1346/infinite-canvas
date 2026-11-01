import { App, Button, Form, Input, Switch } from "antd";
import { Copy, Network, Wifi } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { desktopProxyUrl } from "@/lib/desktop-network";
import { useCopyText } from "@/hooks/use-copy-text";
import { testLocalProxy } from "@/services/api/local-proxy";
import { DEFAULT_LOCAL_PROXY_URL, LOCAL_PROXY_PACKAGE, normalizeLocalProxyUrl, useConfigStore } from "@/stores/use-config-store";

export function ConfigLocalProxy() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const copyText = useCopyText();
    const [testing, setTesting] = useState(false);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const command = localProxyCommand(config.proxyUrl);
    const desktop = desktopProxyUrl();

    const testProxy = async () => {
        setTesting(true);
        try {
            message.success(t("config.proxy.available", { proxy: await testLocalProxy(desktop || config.proxyUrl) }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.proxy.unreachable"));
        } finally {
            setTesting(false);
        }
    };

    if (desktop) return (
        <section className="rounded-lg border border-stone-200 p-3 dark:border-stone-800" data-desktop-network>
            <div className="flex items-center gap-2 text-sm font-semibold"><Network className="size-4" />桌面内置网络转发 · 已自动启用</div>
            <p className="mt-2 text-xs text-stone-500">在渠道中填写中转地址和自己的密钥即可使用，无需安装 Node.js、运行命令或配置本地代理。升级前保存的手动代理设置不影响桌面版。</p>
            <p className="mt-2 text-xs text-stone-500">使用系统网络及系统代理，保持证书校验。此功能处理浏览器跨域，不是 VPN；中转停服、密钥或余额问题仍会返回实际错误。</p>
            <Button className="mt-3" icon={<Wifi className="size-4" />} loading={testing} onClick={() => void testProxy()}>检查内置转发服务</Button>
        </section>
    );

    return (
        <Form layout="vertical" requiredMark={false}>
            <section className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <Network className="size-4" />
                            {t("config.proxy.title")}
                        </div>
                        <div className="mt-1 text-xs text-stone-500">{t("config.proxy.description")}</div>
                    </div>
                    <Switch checked={config.proxyEnabled} onChange={(checked) => updateConfig("proxyEnabled", checked)} />
                </div>
                {config.proxyEnabled ? (
                    <>
                        <div className="mt-3 rounded-md bg-stone-100 px-3 py-2 dark:bg-stone-900">
                            <div className="mb-1 text-xs text-stone-500">{t("config.proxy.startHint")}</div>
                            <div className="flex items-center justify-between gap-3">
                                <code className="min-w-0 truncate text-xs">{command}</code>
                                <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => copyText(command)} />
                            </div>
                        </div>
                        <Form.Item label={t("config.proxy.address")} extra={t("config.proxy.addressDescription")} className="mt-3 mb-0">
                            <Input
                                value={config.proxyUrl}
                                placeholder={DEFAULT_LOCAL_PROXY_URL}
                                onChange={(event) => updateConfig("proxyUrl", event.target.value)}
                                onBlur={(event) => updateConfig("proxyUrl", normalizeLocalProxyUrl(event.target.value) || DEFAULT_LOCAL_PROXY_URL)}
                            />
                        </Form.Item>
                        <Button className="mt-3" icon={<Wifi className="size-4" />} loading={testing} onClick={() => void testProxy()}>
                            {t("config.proxy.test")}
                        </Button>
                        <div className="mt-3 text-xs text-stone-500">{t("config.proxy.channelHint")}</div>
                    </>
                ) : null}
            </section>
        </Form>
    );
}

function localProxyCommand(proxyUrl: string) {
    // Pinned to @latest because npx otherwise reuses whatever version it already cached.
    const command = `npx ${LOCAL_PROXY_PACKAGE}@latest`;
    try {
        const port = new URL(normalizeLocalProxyUrl(proxyUrl) || DEFAULT_LOCAL_PROXY_URL).port;
        return port && port !== new URL(DEFAULT_LOCAL_PROXY_URL).port ? `${command} --port ${port}` : command;
    } catch {
        return command;
    }
}
