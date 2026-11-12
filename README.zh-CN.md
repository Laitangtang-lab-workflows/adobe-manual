# adobe-manual

**AI 代理驱动 Adobe Illustrator 与 Photoshop 的实战手册：权限对齐、COM DoJavaScript 通道、JSX 批量模板，embed、换图、组版、导出的全部实锤坑，外加一支 72 图实战通过的链接改嵌入成品脚本。**

> [!NOTE]
> 本仓**全部内容由 AI 维护**，人类定方向、做决策，详见 [AI 维护声明](#ai-维护声明)。英文说明见 [README.md](README.md)。

## 解决什么问题

用代理自动化 Adobe 听起来容易，做起来处处碰壁：权限不对齐则全部 MCP 工具超时；MCP 根本没有删除对象与执行脚本的工具；两套坐标系悄然不同；`embed()` 以四种方式丢名字、丢翻转、丢位置、丢 z 序。本手册是数月真实出稿工作的致密沉淀——**每一条都在活稿件上实锤过**：

- **环境与通道**——权限对齐矩阵（不满足即全员 -32001 超时）、Illustrator 搬迁后的注册表修复、COM `DoJavaScript` 直连（即时返回、结果可打印）对比 30–40 秒的 `--run` 通道、中文路径的 UTF-8 与 BOM 编码规则
- **实测能力边界**——哪些 MCP 工具可靠、哪些虚报（RGB modify 假成功）、哪些坏了（Photoshop open_document），各配精确绕法
- **JSX 手艺**——放置、移动、嵌入的正统顺序（经 24、48、144 图多批确立）、位置复用绕开坐标换算、按预期名单驱动的幂等批量、标记占位 z 序归位、独立翻转相、收尾几何矫正相
- **Photoshop 专项**——`layer.kind` 陷阱、跨文档复制限制、从前后像素对反推 LUT 复现用户手调的方法（残差 0.7%，48 张实测）
- **成品脚本**——`embed_phase_diagram.jsx`（v8）：含翻转复原、z 序归位、拆组、双重核对的全量链接改嵌入；72/72 实战通过，目标路径经参数传入

## skill 安装

```
git clone https://github.com/Laitangtang-lab-workflows/adobe-manual ~/.agents/skills/adobe-manual
```

兼容一切支持 SKILL.md 约定的 agent 框架（Windows、Illustrator 与 Photoshop 2024、PowerShell）；人类脚本作者当普通文档读同样有价值。

## 仓库结构

| 路径 | 内容 |
|---|---|
| `SKILL.md` | skill 入口：四条总铁律 |
| `references/illustrator-guide.md` | Illustrator 实战指南全文（12 节） |
| `references/photoshop-guide.md` | Photoshop 指南含 LUT 反推法 |
| `scripts/embed_phase_diagram.jsx` | v8 链接改嵌入成品脚本 |

## AI 维护声明

本仓全部内容（文档、脚本、本 README）由 AI 会话在人类监督下编写与更新，每个坑都是 AI 会话在人类指挥下操作真实 Adobe 文档时先踩到的。提交均由机器生成，人类把关方向与决策，不逐行审码。

## 证书

[CC0-1.0](LICENSE)——公有领域贡献。可任意使用、fork、并入任何项目，无须署名（注明出处是善意但非义务）。

提交 PR 即表示同意你的贡献同样以 CC0 贡献。
