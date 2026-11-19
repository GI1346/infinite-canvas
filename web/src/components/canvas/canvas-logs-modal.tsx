import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Button, Collapse, Empty, Modal } from "antd";
import { Check, Copy } from "lucide-react";
import { useCopyText } from "@/hooks/use-copy-text";
import { diagnosticRevision, diagnosticStorageError, diagnosticText, readDiagnosticLogs, subscribeDiagnostics, type DiagnosticLog } from "@/services/diagnostics";

function CopyLogButton({ label, text, size }: { label: string; text: string; size?: "small" }) {
    const copy = useCopyText();
    const [copied, setCopied] = useState(false);
    const attempt = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => { ++attempt.current; clearTimeout(timer.current); }, []);
    const handleCopy = async () => {
        const id = ++attempt.current;
        clearTimeout(timer.current);
        setCopied(false);
        if (!(await copy(text)) || attempt.current !== id) return;
        setCopied(true);
        timer.current = setTimeout(() => setCopied(false), 1300);
    };
    return <Button size={size} icon={copied ? <Check data-copy-success className="size-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:duration-150" /> : <Copy className="size-4" />} disabled={!text} onClick={() => void handleCopy()}>{label}</Button>;
}

export function CanvasLogsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const revision = useSyncExternalStore(subscribeDiagnostics, diagnosticRevision);
    const [entries, setEntries] = useState<DiagnosticLog[]>([]);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!open) return;
        setEntries([]);
        let active = true;
        readDiagnosticLogs().then((logs) => { if (active) { setEntries(logs); setError(""); } }).catch(() => { if (active) setError("日志读取失败，请检查本地存储"); });
        return () => { active = false; };
    }, [open, revision]);
    return <Modal title="错误日志" open={open} onCancel={onClose} width={850} footer={null} styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}>
        <div data-canvas-overlay data-canvas-no-zoom className="space-y-3">
            <p className="text-sm opacity-65">记录更新后发生的错误，仅保存在本机。密钥、请求正文和图片内容不记录；清空请到顶部“清理 → 清理错误日志”。浏览器屏蔽的服务端状态码可能无法读取。</p>
            {(error || diagnosticStorageError()) && <Alert type="error" showIcon title={error || diagnosticStorageError()} />}
            <CopyLogButton text={entries.map(diagnosticText).join("\n\n")} label={`复制全部日志（${entries.length}）`} />
            {entries.length ? <Collapse items={entries.map((entry) => ({ key: entry.id, label: <div className="min-w-0"><div className="text-xs opacity-65">{new Date(entry.time).toLocaleString()} · {entry.source}{entry.status ? ` · HTTP ${entry.status}` : ""}</div><div className="break-words whitespace-pre-wrap">{entry.message}</div></div>, children: <><CopyLogButton size="small" text={diagnosticText(entry)} label="复制此条" /><pre className="mt-2 select-text whitespace-pre-wrap break-all text-xs">{diagnosticText(entry)}</pre></> }))} /> : <Empty description="暂无错误日志" />}
        </div>
    </Modal>;
}
