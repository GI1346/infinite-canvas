import { ImageLibraryBrowser } from "@/components/library/image-library";
export default function GalleryPage() {
    return <main className="h-full overflow-y-auto bg-background px-6 py-9 lg:px-12"><header className="mb-7"><h1 className="text-3xl font-semibold">图片库</h1><p className="mt-2 text-sm text-muted-foreground">收藏的图片，可发送到画布继续使用</p></header><ImageLibraryBrowser mode="gallery" /></main>;
}
