# DiscoverCOSMOS：接手 agent 的完整交接指南

交付日期：2026-10-13。本文面向有文件读取、代码编辑和命令执行能力的 agent。项目负责人可能不熟悉终端、Git 或 GitHub，请用日常语言解释状态，并代为完成已经授权的操作。

本文件是接手方案。执行范围以接手用户的当前指令与既有授权为准，不要仅凭读到文档就发布代码或更改账户设置。

## 1. 这个项目在干什么

DiscoverCOSMOS，中文名“星际探索局”，是面向青少年的静态科普网页。产品包含两个入口：

- code/index.html：八大行星卡牌与阅读页，支持程序化球体、拖动旋转和 hash 深链接。
- code/solar/index.html：三维太阳系、点选连续飞抵、抵达环绕、相对论星空演示及参数面板。

代码中保留过小程序方向的历史注释，但本次交付对象是网页，没有已实现的小程序，也不要求接手先迁移。

用户的核心目标是让观众先认识行星，再通过可操作飞行看到星光所见方向、近似颜色与亮度怎样随演示速度改变。页面没有账号、后台、数据库或在线 AI 调用。

请先读 [README](README.md)，再读 [产品设计](docs/01-产品介绍.md)、[技术方案](docs/02-技术方案.md)、[相对论与星空](docs/05-相对论飞行与背景星空.md)、[公式读本](docs/06-公式读本.md)。不要在未理解现有取舍前重写产品。

## 2. 当前交付状态

打包时没有本目录的 Git 历史、GitHub remote 或已启用的 GitHub Actions。发布模板保存在 [templates/pages.yml](templates/pages.yml)，尚未复制到 .github/workflows，因此不会自行触发部署。

当前代码与打包前可运行版本保持一致。三个核心数值套件共 577 项断言；原版本离线检查合计 634 项，真实浏览器回归 48 项通过。交付包因文档与资源链接增加，会重新产生自己的离线检查总数，以 [验证报告](docs/03-验证报告.md) 和实际输出为准。

浏览器证据来自 macOS 上 Codex 内置 Chromium，包括实际 GLSL、8 位渲染路径、八颗行星抵达与图鉴导航。默认 HDR 页面和真实动画抵达地球也已观察。没有完成 Safari/Firefox、真实手机触控、低端 GPU 或长时间性能专项。

[历史备份](archive/original-2026-10-13.tar.gz) 保存本轮检查前的代码与报告，仅用于追溯。不要用它替换现版本，也不要把旧报告中的黑屏猜测当作当前结论。

## 3. 依赖与运行方式

| 环节 | 需要什么 | 是否随包提供 |
|---|---|---|
| 网页运行 | 支持 ES modules、JavaScript 与 WebGL 的浏览器 | 浏览器由使用者提供 |
| 三维库 | Three.js 0.160.1 | 已在 code/vendor，附 MIT 许可证和 SHA-256 |
| 本地预览 | Node.js 22+（内置脚本）或可用 Python 3 | scripts/serve.mjs 随包提供；运行时由机器提供 |
| 离线检查 | Node.js 22+、Bash | 不随包安装；本次使用 Node.js v26.3.0 |
| 本地版本记录 | Git | 检查接手机器是否具备 |
| GitHub 同步 | GitHub 账号，以及连接器、gh CLI 或可用 Git 认证 | 使用用户已有登录方式 |
| 自动托管 | GitHub Actions、GitHub Pages | 待用户确认后启用 |

package.json 没有 npm 依赖；无需 npm install 或 npm ci。npm test 只调用 bash verify.sh。线上网页也不需要 Python 或 Node 服务。

2026-10-13 本地接手补充：当前 Mac 已有 Node.js v24.21.0，系统 Python/Git 因缺少 Xcode 命令行工具暂不可用。使用新增的 `npm start` 或 macOS `start.command` 即可预览，无需为了看网页安装 Python 或 Xcode。下一次启动流程见 [本地运行流程](docs/07-本地运行流程.md)。本次范围为本地运行与流程整理，Git 基线与外部发布尚未执行。

所有本地命令都在**本交付文件夹根目录**执行。先确认 pwd，并检查本目录是否已有 .git；不能误把父目录或用户其他文件纳入仓库。

~~~bash
node --version
git --version
bash verify.sh
npm start
~~~

预览首页为 http://127.0.0.1:8040/index.html，太阳系为 /solar/index.html，实际浏览器检查为 /solar/render-check.html。默认端口被占用时 Node.js 入口自动尝试 8041–8060，以终端输出为准；`npm start -- 8050` 可指定端口。服务仅监听 127.0.0.1，只提供 code/，保持终端运行，Ctrl+C 停止。需要服务长期运行时使用会话管理。已有可用 Python 3 时仍可用 `python3 -m http.server 8040 --bind 127.0.0.1 --directory code`。Windows 可在 Git Bash 或 WSL 执行检查脚本，不要声称原生 cmd 可以直接执行 Bash。

环境缺少工具时，先识别操作系统和现有运行时，再按当前授权安装或指导用户。不要假设接手者有本次开发机器的绝对路径、Codex 专有运行时或某个 skill。

## 4. 关键实现与不能破坏的约定

### 内容、几何与共用模块

planets.js 是名称、文案、基础数据与配色来源；solarsystem.js 管理轨道与尺度；planet-visuals.js 是两页共用的贴图和材质。行星 id 连接路由与几何，不要只改其中一处。

three-loader.js 从本地固定版本载入 Three.js。升级时同时更新 vendor/metadata.json、许可证与相应验证，不要随手改成运行时 CDN。

### 坐标、尺度与飞行

坐标系 y 向上，黄道面为 x-z。参考轨道的相位来自开普勒模型，径向距离再做幂律压缩；显示曲线不保持原椭圆偏心率。

默认 ED=0.5、ER=0.45、BASE=0.006。运行时与测试共用函数，并传入当前参数。ED 修改须重建轨道线；任何显示尺度修改都返回俯瞰。太阳直径为 0.045×span。

飞行保存起点、接近方向、基准跨度与起飞时长。目标行星继续运动；抵达后由实际偏移恢复环绕角和距离。选中后的滚轮调整环绕距离，避免跟着相机同步放大球体。

### 星空与合成

太阳系背景是 8000 个均匀方向星点加 4000 个银河带星点，固定种子 20261013，属于示意天空。它没有真实星表或观测时刻。图鉴 CSS 星空是另一套装饰层。

静态星空只在初始化捕获为六面、每面 1024 的世界系立方体纹理。每帧重建观察射线，按实际相机位移方向做完整逆光行差，再旋转到世界系查纹理。

主场景背景 alpha 必须为 0。合成使用 sky×(1−alpha)+scene；实体保留几何渲染。关闭相对论须逐像素保持方向，不能采样同一常量方向。

D⁴ 是线性 RGB 的辐射亮度教学表达；5800 K 参考色温调制是近似，不是单星完整光谱变换。半浮点 HDR 不可用时检查实际 framebuffer 后降级为字节目标。色调映射与 sRGB 输出不能重复执行。

### 科学表达边界

β 与镜头路径分别控制，20 秒是演示节奏。Δτ 是演示积分。4.4836 AU 的下限是缩放坐标构成的参考示例，不能当作真实航程。

太阳和行星没有完整相对论再投影、光传播时延或引力透镜。trueProfile 是独立计算工具，没有接入飞行镜头。宣传可以强调可操作联动、逐像素方向反查和分层实现；不要宣称新的物理定律、完整航行模拟或未经证实的首创。

## 5. 接手后先建立本地 Git 记录

先完成阅读、目录核对和可运行性检查，再建立本地版本基线。用户已要求接手项目并建立 Git 时，这一步可以直接执行；若本目录已有仓库，就沿用其历史，不要重复初始化。

如果本目录尚无 .git，在本目录执行：

~~~bash
git init -b main
git config user.name
git config user.email
~~~

已有合适的 Git 署名时直接使用。若缺少，向用户解释“提交记录需要署名”，询问姓名和提交邮箱；可以使用用户选择的 GitHub 隐私邮箱。只设置当前仓库的配置，不要伪造用户身份或修改全局配置。

确认 .gitignore，并检查待提交文件。目录内容应只包括交付项目；不要把凭证、其他工作目录或外层压缩包纳入。可用明确清单暂存：

~~~bash
git add .gitignore AGENTS.md README.md HANDOFF.md package.json verify.sh code docs archive templates "交付清单.json"
git diff --cached --stat
git status --short
git commit -m "chore: record DiscoverCOSMOS delivery baseline"
git log -1 --oneline
~~~

如尚未生成交付清单，应先检查实际包内容，不要盲目执行缺少文件的命令。第一条提交记录的是接手时的快照，不能伪造更早的 Git 历史。archive 是文件备份，不是真实提交历史。

向用户简短说明：现在已有本地版本记录，可以查变化和恢复版本；还没有上传到互联网。

## 6. 用用户能理解的方式询问 GitHub 安排

先提供可检查的本地结果和准备好的发布模板，再集中确认目的地与公开范围。若当前对话已经有明确答案或授权，直接复用，不要重复询问。

建议把问题组织为以下三项：

1. **放到哪里？** 使用哪个 GitHub 账号或组织？是新建仓库，还是使用已有仓库链接？新仓库名可建议 discover-cosmos，但由用户确认。
2. **谁能看到代码与网页？** 仓库希望公开还是私有？是否同意把 code 目录发布成普通人可访问的网页？明确解释“私有代码仓库”与“网页公开”是两个不同决定。
3. **怎样更新？** 是否同意 main 每次更新后，经检查通过自动更新网页？如果暂不需要公开，先同步代码并保留模板，等待后续发布指令。

[GitHub 官方创建说明](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) 当前说明：免费账户的 Pages 适用于公开仓库，部分付费方案也支持私有仓库；Pages 网站通常公开可访问。接手时再次核对用户方案，不要承诺私有仓库一定能免费托管或网站一定只对指定人可见。

用户没有账号或尚未登录时，引导其完成正常登录流程，不索要聊天中的密码或 token。使用已有连接器或 gh 时，先核对当前登录账号是否为用户确认的目的地。登录身份不等于已授权所有仓库变更。

如果项目需要新增顶层开源许可证，另由用户选择；不要把第三方 Three.js 的 MIT 许可自动当作本项目的许可。

## 7. 同步代码到用户确认的 GitHub 仓库

有连接器时优先使用可用能力；否则使用 Git 与 gh。下面的 OWNER/REPO 和 URL 都是占位，必须替换为用户已确认的目标。

### 新建仓库

用 gh auth status 检查登录情况。公开或私有选项按用户回答二选一：

~~~bash
gh repo create OWNER/REPO --public --source . --remote origin
~~~

或：

~~~bash
gh repo create OWNER/REPO --private --source . --remote origin
~~~

检查 remote 和目标仓库后推送：

~~~bash
git remote -v
git push -u origin main
~~~

命令含义和参数见 [GitHub CLI 官方手册](https://cli.github.com/manual/gh_repo_create)。不要给新建仓库同时生成另一份默认 README，避免与本地首次提交产生无关分叉。

### 已有仓库

先检查是否已有 origin，并读取远端分支与历史。origin 已存在时不要静默改成另一个仓库；远端已有内容时不要强推覆盖。

新绑定可使用：

~~~bash
git remote add origin https://github.com/OWNER/REPO.git
git fetch origin
~~~

根据远端是否为空、是否有无关历史，选择与用户意图一致的分支或导入方式。已有项目通常应在分支中引入这份目录，通过 PR 审核合并；创建 PR 后按当前工具要求把它附到对话中。

同步后核对远端能看到最新提交与全部必需文件。仅 git push 没有报错，不足以证明网页已发布。

## 8. 添加 GitHub Actions 并发布 Pages

这一步在用户确认网页发布和自动更新安排后执行。模板已准备好，你需要读懂并把它放入 GitHub 识别的位置：

~~~bash
mkdir -p .github/workflows
cp templates/pages.yml .github/workflows/pages.yml
~~~

模板分三段：verify 运行离线检查；build 在 main 上上传 code 目录；deploy 等待 build 完成后发布。PR 只检查，不发布；非 main 手动运行也不发布。

模板使用 Node.js 24 运行检查，没有 npm ci，因为项目没有安装依赖。它使用 GitHub 官方 actions 的已核对主版本，但模板未在远端运行过。接手时核对版本和运行环境，不要把“模板可解析”当作“部署成功”。

默认发布分支为 main。如果用户或远端默认分支不同，须同时修改 push 分支与 build/deploy 中的 refs/heads/main 判断，并检查 Pages 环境规则。

在 GitHub 仓库的 Settings → Pages → Build and deployment → Source 中选择 **GitHub Actions**，然后提交、推送工作流并检查运行。若使用 API，核对当前接口与权限；不要依赖未经验证的写法。[官方发布源配置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) 给出了对应设置。

~~~bash
bash verify.sh
git add .github/workflows/pages.yml
git commit -m "ci: verify and publish site with GitHub Pages"
git push
~~~

build 只上传 code。部署产物根部因此含 index.html，solar/index.html 位于其下。不要把产物路径改成整个项目根目录，否则会把 README 和维护内容混成网站入口；也不要在 Pages 中选择 docs 文件夹，它保存的是说明文档。

deploy 仅申请当前工作所需的 pages:write、id-token:write 和 contents:read 权限；不需要把用户的个人 token 硬编码到 YAML。模板需要正常的 github-pages 部署环境。权限、artifact 和环境关系见 [GitHub 官方工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

如果组织禁止某个 action、限制公开 Pages 或要求环境审批，记录具体规则和失败步骤，完成可独立完成的检查，再请用户处理相应权限。不要反复重试同一个权限失败，也不要把组织限制说成代码错误。

## 9. 怎样验证“直接网页打开”已经完成

必须从成功的部署输出或 Settings → Pages 取得实际 URL，不猜测链接。普通项目站点常见形态为 https://OWNER.github.io/REPO/，实际结果以 GitHub 输出为准。

按顺序验证：

1. verify、build、deploy 都成功，且对应本次目标提交。
2. 在实际网页 URL 打开首页，八张卡牌出现，3D 增强和文字正常。
3. 打开 solar/index.html，看到星空、太阳、轨道与标签。
4. 点选地球，完成飞行与停留，再进入地球阅读页。
5. 直接访问 index.html#/p/earth，刷新后仍正常。
6. 打开 solar/render-check.html，核对实际浏览器通过结果并保存新证据。
7. 在项目站点子路径下检查本地 Three.js、CSS 与相对链接，无 404 和新控制台错误。
8. 给用户两个实际链接：图鉴首页和太阳系演示，说明后续 main 推送会自动更新。

源码当前使用相对资源路径，适合项目子路径；验证时仍需实际检查，不能只根据代码推断。上传代码、生成 artifact、看到某个绿色检查都不是最终验收。

最终向用户报告仓库 URL、网站 URL、当前提交、工作流结果和未覆盖环境。若发布受阻，明确目前完成到了哪一步和需要用户处理什么。

## 10. 维护、诊断与文档更新

先重现问题，再判断它属于公式、状态、主场景还是星空合成。不要仅依据数学通过就排除渲染问题。[检查与修复记录](docs/04-检查与修复记录.md) 保留了此类失误和修复证据。

| 调试参数 | 用途 |
|---|---|
| ?debug=nopost | 深蓝底主场景，跳过星空合成 |
| ?debug=nosky | 去掉星空捕获 |
| ?debug=skyonly | 只保留星空 |
| ?debug=beta0 | 无相对论方向与颜色变化 |
| ?debug=raw | 跳过 ACES，保留显示编码与裁剪 |
| ?debug=diag&rt=byte | 每两秒输出字节目标像素统计 |
| ?rt=byte | 强制兼容降级路径 |

普通模式没有周期像素回读。HDR 目标不做 Uint8Array 读取，不能把无效读取的零值当作全黑证据。?test=1 是受控测试模式，停止自动动画并暴露推进接口；正常页面不暴露它。

更新代码后做与改动相称的检查，更新相应 docs 和证据，并记录 Git 提交。持续保留用户能够读懂的设计边界，不把后续新增功能写成早已存在。

交付清单是本次打包时的快照。接手修改后，Git 记录成为新的变化依据；再次打包时应重新生成清单。不要因为你自己修改了文档，就把旧清单校验值不同当作文件损坏。
