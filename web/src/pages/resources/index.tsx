import { ResourceBrowser } from "@/components/library/resource-browser";
export default function ResourcesPage() {
    return <main className="h-full overflow-y-auto bg-background px-6 py-9 lg:px-12"><header className="mb-7"><h1 className="text-3xl font-semibold">资源管理器</h1><p className="mt-2 text-sm text-muted-foreground">保存和复用工作流、提示词</p></header><ResourceBrowser /></main>;
}
