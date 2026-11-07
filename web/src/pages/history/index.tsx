import { ImageLibraryBrowser } from "@/components/library/image-library";
export default function HistoryPage() {
    return <main className="h-full overflow-y-auto bg-background px-6 py-9 lg:px-12"><header className="mb-7"><h1 className="text-3xl font-semibold">生成历史</h1><p className="mt-2 text-sm text-muted-foreground">保留本机生成结果，收藏图片或发送到画布继续创作</p></header><ImageLibraryBrowser mode="history" /></main>;
}
