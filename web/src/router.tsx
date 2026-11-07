import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import GalleryPage from "@/pages/gallery";
import ImagePage from "@/pages/image";
import HistoryPage from "@/pages/history";
import ResourcesPage from "@/pages/resources";
import NotFound from "@/pages/not-found";
import VideoPage from "@/pages/video";

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <CanvasPage /> },
            { path: "/image", element: <ImagePage /> },
            { path: "/video", element: <VideoPage /> },
            { path: "/gallery", element: <GalleryPage /> },
            { path: "/history", element: <HistoryPage /> },
            { path: "/resources", element: <ResourcesPage /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/config", element: <ConfigPage /> },
            { path: "/settings", element: <ConfigPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
