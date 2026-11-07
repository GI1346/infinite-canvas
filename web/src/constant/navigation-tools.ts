import { FolderOpen, History, Images, Library, Plug, Settings2 } from "lucide-react";

export const navigationTools = [
    { slug: "canvas", icon: FolderOpen },
    { slug: "history", icon: History },
    { slug: "gallery", icon: Images },
    { slug: "resources", icon: Library },
    { slug: "config", icon: Plug },
    { slug: "settings", icon: Settings2 },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
