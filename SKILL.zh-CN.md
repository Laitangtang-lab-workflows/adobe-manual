---
name: adobe-manual
description: >-
  Adobe Illustrator / Photoshop 使用手册（MCP 工具 + COM DoJavaScript + JSX 脚本）。当用户提到 "Illustrator""Photoshop"".ai 文件""JSX""COM""云图组版""批量换图""原位替换""重链图片""实验照片调色""LUT""排版" 或要读写 .ai 文档、批量放置/替换嵌入图、导出预览时触发。核心铁律：MCP server 与 Adobe 进程权限必须对齐（否则全部工具超时）；MCP 无删除/执行脚本工具，批量任务走 COM DoJavaScript 直连；两个坐标系（artboard-web vs document）极易混。英文正本见 SKILL.md。
---

# Adobe MCP — Illustrator / Photoshop 自动化操作（中文伴侣件）

> 本文件为中文速览，英文正本（内容一致、以它为准）见 [SKILL.md](SKILL.md)，深读材料 references/ 仅有英文版；示例 JSX 脚本注释为中文。

Illustrator（illustrator-mcp-server）+ Photoshop（photoshop-mcp）的实战操作手册：环境前提（权限对齐）、工具能力边界、坐标系统、JSX 脚本通道、批量换图/组版/调色流程。

## 四条总铁律（先记）

1. **权限对齐（不满足 = 全部 MCP 工具超时 -32001）**：server（node）与 Illustrator/Photoshop 进程权限必须一致（管理员对管理员、普通对普通）。Adobe 已在运行时"以管理员启动"只会聚焦旧实例——必须先完全退出再启动。
2. **批量任务走 COM DoJavaScript 直连**（比 `--run` 快得多，返回值可打印核对）：`$ai = New-Object -ComObject Illustrator.Application; $ai.DoJavaScript($jsx, @(), 1)`。
3. **Illustrator 两坐标系**：artboard-web（画板左上原点、Y 向下）vs document（画板左下原点、Y 向上）；**批量换图最稳解 = 位置复用旧图 left/top/width/height，不做坐标换算**。
4. **MCP 已知缺陷绕过**：子图层对象 notFound（移顶层或 JSX）；RGB 色 modify 虚报（用 gray 格式）；Photoshop open_document 有 bug（JSX `app.open`）。

## 内容导航

| 域 | 文件（英文） | 内容 |
|---|---|---|
| Illustrator | references/illustrator-guide.md | 环境前提/注册表修复、MCP 能力边界、坐标系、JSX 通道与模板、人机协作 diff 流程、云图换版一步法、批量排版与实验相图组版实战、大阵列换图实战（先 move 后 embed 主顺序）、72 图嵌入实战（三坑与镜像判证法）、快速定位表 |
| Photoshop | references/photoshop-guide.md | COM 通道、layer.kind 陷阱、跨文档复制、调整图层参数读不出的 LUT 反推法、快速定位表 |
| 示例代码 | scripts/embed_phase_diagram.jsx | 链接图整体改嵌入的完整模板（v8）：快照纯数据、现读末尾、翻转复原、z 序标记归位、拆组、收尾矫正、双重复核；目标路径经参数传入 |

## 分工边界

- matplotlib 出图（进 Illustrator 之前）：`academic-plotting` skill；
- ParaView 云图渲染：`paraview-pitfalls` skill（其流水线末端即接本 skill 组版）；
- 驱动 Adobe 的 PowerShell 编码/BOM 坑：见 references 内相应章节。
