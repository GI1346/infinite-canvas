import { Images, FolderOpen, Settings2 } from "lucide-react";

export const navigationTools = [
    {
        slug: "canvas",
        icon: FolderOpen,
    },
    {
        slug: "assets",
        icon: Images,
    },
    {
        slug: "config",
        icon: Settings2,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
