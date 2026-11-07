import { useLocation } from "react-router-dom";

import { AppConfigPanel } from "@/components/layout/app-config-modal";

export default function ConfigPage() {
    const system = useLocation().pathname === "/settings";
    return <main className="h-full overflow-y-auto bg-background">
        <div className={system ? "mx-auto max-w-[1440px] px-6 py-8 lg:px-10" : "w-full px-5 py-4"}>
            <header className={system ? "mb-7" : "mb-2"}><h1 className="text-2xl font-semibold">{system ? "系统设置" : "模型与接口"}</h1><p className={system ? "mt-2 text-sm text-muted-foreground" : "mt-1 text-sm text-muted-foreground"}>{system ? "查看和管理本地存储" : "管理渠道连接、可用模型与全局默认模型"}</p></header>
            <AppConfigPanel key={system ? "system" : "models"} section={system ? "system" : "models"} initialTab={system ? "local-storage" : "channels"} />
        </div>
    </main>;
}
