import { useEffect } from "react";
import { createPortal } from "react-dom";

interface UsageGuideDialogProps {
  open: boolean;
  onClose: () => void;
}

interface GuideSection {
  title: string;
  items: string[];
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "一、顶部入口与首次操作",
    items: [
      "右上角“？”会打开本向导；首次使用、安装完新 CLI 后，建议先点击“刷新 CLI 检测”重新识别本机可用状态。",
      "如顶部出现“安装前置环境”“安装 Git”或“安装 Node.js”按钮，说明当前机器缺少对应依赖；先补齐这些前置项，再继续安装 CLI 会更稳定。",
      "“应用配置”会把当前 CLI 开关、顺序、自定义显示名、右键菜单分组名称和菜单总开关统一写入右键菜单；调整完成后再执行一次即可。"
    ]
  },
  {
    title: "二、CLI 页怎么用",
    items: [
      "已检测到的 CLI 卡片支持拖拽排序；右侧输入框可修改最终显示名称，开关用于控制该 CLI 是否出现在右键菜单中。",
      "已检测到的 CLI 还可执行“登录”“升级”“卸载”；如果出现“加入环境变量”操作，说明该命令目录还没有加入当前用户 PATH。",
      "未检测到的 CLI 可使用“快速安装向导”“仅执行安装”“复制安装命令”“打开安装说明”；带“Node.js 依赖”标签时，表示该 CLI 依赖 Node.js 与 npm。",
      "Kimi / Kimi Web 的快速安装向导会按阶段处理 uv、Python 和 Kimi 本体；向导期间内置终端会隐藏，但失败时可以展开详情和日志尾部继续排查。"
    ]
  },
  {
    title: "三、配置页怎么用",
    items: [
      "顶部“右键菜单分组名称”用于修改资源管理器中父级菜单标题；旁边的总开关用于整体启用或关闭 ExecLink 右键菜单，关闭后会保留配置但不显示菜单项。",
      "“右键菜单状态”用于查看当前是否已应用 v2 菜单、当前分组名称、生效作用域和 legacy 残留，并提供“刷新状态”“通知 Explorer 刷新”“Explorer 兜底刷新”。",
      "“迁移与清理”用于迁移旧版 PowerShell HKCU 菜单、删除当前菜单、清理旧残留，并可在“菜单扫描结果”里扫描或删除已安装分组。",
      "“Windows 11 经典菜单开关”是当前用户级系统开关，会影响整个资源管理器右键菜单，不只影响 ExecLink；“运行与安装策略”则用于调整终端运行器、uv 安装源策略和安装超时。"
    ]
  },
  {
    title: "四、生效方式与排障",
    items: [
      "点击“应用配置”后，请在资源管理器空白处右键验证菜单是否出现；如果修改的是分组名称、排序或显示开关，也需要重新应用后才会生效。",
      "Windows 11 当前仍以经典菜单层为准；如未直接看到 ExecLink，请使用“显示更多选项”或按 Shift+F10 打开经典右键菜单。",
      "如果菜单没有立即刷新，先到“配置”页展开“右键菜单状态”，依次尝试“通知 Explorer 刷新”和“Explorer 兜底刷新”；仍无变化时再考虑重新登录。",
      "如果检测到旧分组、legacy 残留或需要整体清理，可到“迁移与清理”处理；如果切换了“Windows 11 经典菜单开关”但没有立刻生效，通常需要刷新 Explorer 或重新登录。"
    ]
  }
];

export function UsageGuideDialog({ open, onClose }: UsageGuideDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[2150] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#2f2b25]/26 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="关闭使用说明向导"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="使用说明向导"
        className="relative z-10 flex max-h-[min(80vh,720px)] w-[min(560px,calc(100vw-30px))] flex-col rounded-[var(--radius-lg)] border border-[#ddd5c9] bg-[var(--ui-base)] p-4 shadow-[6px_6px_12px_#d5d0c4,-6px_-6px_12px_#ffffff] max-[420px]:w-[calc(100vw-16px)] max-[420px]:p-3"
      >
        <h2 className="m-0 text-base font-semibold text-[var(--ui-text)]">使用说明向导</h2>
        <p className="mt-1.5 text-xs text-[var(--ui-muted)]">以下说明已按当前页面结构整理，可直接对照首页按钮和“CLI / 配置”两个分区使用。</p>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-3">
            {GUIDE_SECTIONS.map((section) => (
              <section
                key={section.title}
                className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[var(--ui-base)] p-3 text-xs text-[var(--ui-text)] shadow-[inset_2px_2px_4px_#d5d0c4,inset_-2px_-2px_4px_#ffffff]"
              >
                <h3 className="m-0 text-sm font-semibold text-[var(--ui-text)]">{section.title}</h3>
                <ul className="mt-2 grid gap-1.5 pl-4">
                  {section.items.map((item) => (
                    <li key={item} className="list-disc leading-[1.55] text-[var(--ui-text)]">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[#ddd5c9] bg-[#e8e1d7] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-[3px_3px_6px_#d5d0c4,-3px_-3px_6px_#ffffff] outline-none transition-[box-shadow,transform,color] duration-150 hover:text-[#665a4f] focus-visible:ring-2 focus-visible:ring-[#8f8072]/40 active:scale-95 active:shadow-[inset_1px_1px_3px_#d5d0c4,inset_-1px_-1px_3px_#ffffff]"
            onClick={onClose}
          >
            我知道了
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
