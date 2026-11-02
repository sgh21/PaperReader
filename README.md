# 论文双语阅读项目

在本项目的 Codex 会话中上传论文 PDF，Codex 会按 `AGENTS.md` 默认生成完整的中英文对照阅读文件夹。网页使用根目录的 `reader_template.html`，不依赖在线资源。文件夹包含原 PDF 的副本，不会改动原始文件；它不会在后台监控文件夹。

Git 仓库不包含论文文件和翻译结果、个人分组与标签、临时工作文件及本机虚拟环境。

## 输出位置

每篇论文放在 `papers/<作者-年份-短标题>/`，默认不生成压缩包：

```text
source.pdf              原文副本
reader.html             网页阅读版，双击即可打开
paper.md                Markdown 阅读版
source_map.json         页码、原文、译文和图表映射
translation_notes.md    识别和核对说明
note.md                 用户批注（首次保存批注时创建）
assets/                 原文图表、公式截图及文献库代表图
```

## 本地文献库

双击项目根目录的 `启动文献库.vbs`，文献库会在浏览器中打开，无需保留命令窗口。关闭所有文献库和双语阅读页后，本地服务空闲约两分钟便会自动退出；下次双击即可重新打开。左侧可新建和管理索引文件夹，论文卡片右上角的菜单可将文献加入或移出多个文件夹。分组保存在 `library_data/folders.json`，不会移动论文文件。

文献库读取每篇论文的 `assets/library_cover.png` 和 `source_map.json`。完成新论文时，Codex 会从原文选择代表图并保存来源信息；文献库自动发现新条目，不需要重写网页或已有分组。代表图的宽高比须在 1.6–2.6 之间；过长的组合图应选择能独立表达主题的子图裁切，完整图表仍保留在阅读稿中。缺少代表图时显示占位图。

论文卡片右上角的“⋯”提供“管理标签”和“文件夹管理”。标签可在多篇论文间复用，颜色同步；创建或修改时可选择标准色，也可自定义颜色。卡片左上角显示最近添加的三个标签。标签保存在 `library_data/tags.json`，从最后一篇论文移除后自动清除。

论文卡片按最近打开的时间排序；卡片底部的紫线显示最近停留位置，鼠标悬停封面可查看百分比，再次打开论文时会回到上次位置。进度按网页滚动位置估算，保存在当前浏览器中；更换浏览器或清除该网站数据后不会同步。此功能需从文献库打开论文。

从文献库打开论文后，选中标题或同一段英文、中文中的文字，点击“添加批注”，选择类型、颜色并填写内容。悬停高亮文字或另一语言旁的同色标记可查看批注；右上角“批注”可按论文顺序查看、定位、编辑或删除。每篇笔记保存在其阅读文件夹的 `note.md`，不需要联网；直接双击离线 `reader.html` 可阅读，批注功能需从文献库打开。

选定已有图表后，可通过以下命令设置代表图：

```powershell
.\.venv\Scripts\python.exe tools\set_library_cover.py papers\<论文标识> F001 --reason "选择理由"
```

如果需要裁剪，先目视选定原图上的像素范围，再添加 `--crop X0 Y0 X1 Y1`；工具会检查比例并记录裁剪坐标。

## 辅助工具

首次运行或依赖缺失时，在项目目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

提取页文本、版面候选和检查图：

```powershell
.\.venv\Scripts\python.exe tools\extract_pdf.py <论文PDF路径> work\<论文标识>
```

生成的 `extraction.json` 包含逐页文字、版面块和图表候选；`pages/` 是原页预览。版面结果需与原 PDF 核对，特别是多栏、组合图、公式和跨页段落。缺乏文字层的页面会尝试本地 OCR，识别不清处必须注明。

人工核对后的图表、公式区域可以用 `tools/crop_regions.py` 批量裁取。区域 JSON 是一个数组，每项包含 `file`、一基页码 `page` 和 PDF 坐标 `bbox`，例如：

```json
[{"file":"figure_01.png","page":3,"bbox":[50,50,560,300]}]
```

```powershell
.\.venv\Scripts\python.exe tools\crop_regions.py <论文PDF路径> <区域JSON路径> papers\<论文标识>\assets
```

Codex 按论文内容填写 `source_map.json`：顶层包含 `title`、`title_zh`、`authors`、`source_pdf_pages` 和 `blocks`。每个块包含 `type`、`page`、`en`、`zh`；类型使用 `section`、`paragraph`、`reference`、`figure`、`table` 或 `equation`。图表和公式还需填写 `asset`，图表可附 `number` 和中文表格 `rows`。可按需提供 `notes` 和 `glossary`。

完成并核对翻译后，生成网页、Markdown 和说明：

```powershell
.\.venv\Scripts\python.exe tools\render_reader.py papers\<论文标识>\source_map.json --source <论文PDF路径>
```

提取和渲染脚本不调用翻译 API；段落翻译、图表位置确认及最终核对由当前 Codex 会话完成。
