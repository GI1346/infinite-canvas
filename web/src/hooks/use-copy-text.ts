import { App } from "antd";
import { writeClipboardText } from "@/lib/clipboard";
import { useTranslation } from "react-i18next";

export function useCopyText() {
    const { message } = App.useApp();
    const { t } = useTranslation();

    return async (value: string, successText = t("common.copied")) => {
        try {
            await writeClipboardText(value);
            message.success(successText);
            return true;
        } catch {
            message.error("复制失败，请检查剪贴板权限");
            return false;
        }
    };
}
