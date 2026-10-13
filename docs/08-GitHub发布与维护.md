# DiscoverCOSMOS GitHub 发布与维护

2026-10-13（Asia/Shanghai），用户已确认使用当前账号的公开仓库、公开 GitHub Pages，并在 main 每次更新且检查通过后自动部署。

## 当前状态

- 仓库：[zhugexiaohang2-pixel/discover-cosmos](https://github.com/zhugexiaohang2-pixel/discover-cosmos)，通过已登录的 Safari 创建；初始仓库为空，没有生成远端 README 或许可证。
- 本地 Git 基线：`91d432b9902d3180fc7afdd40e903b91760b6442`，只记录本项目 55 个文件，没有纳入父目录。origin 指向上述仓库。
- 提交署名使用用户确认的 GitHub 账号名及该账号设置中提供的隐私 noreply 邮箱，仅设置当前仓库。
- Apple 命令行工具已安装完成，系统 Git 2.50.1 可用。首次基线使用临时安装的 isomorphic-git 1.44.2 创建标准 Git 对象，随后通过系统 Git 的 `git fsck --full` 核对；该临时工具没有加入 package.json，网页仍然没有安装依赖。
- 工作流已放入 [.github/workflows/pages.yml](../.github/workflows/pages.yml)，模板保持同一逻辑。官方 Actions 主版本已核对并更新为 checkout/setup-node v7、configure-pages v6、upload-pages-artifact/deploy-pages v5。
- [工作流结构证据](evidence/github-workflow-check-2026-10-13.txt) 记录本地 YAML、检查门槛和权限结构。代码与历史已推送，Pages 发布源为 GitHub Actions，verify、build、deploy 均成功。

## 已发布与验收

网站入口为 [星际图鉴](https://zhugexiaohang2-pixel.github.io/discover-cosmos/) 和 [太阳系飞行](https://zhugexiaohang2-pixel.github.io/discover-cosmos/solar/index.html)。实际网址来自 GitHub Pages API。首次验收对应提交 `ad2bb0efc13221725be2c1c5ce878ddefbd7bf58`；后续文档与证据提交由同一工作流自动发布。

首次运行的 verify 成功，build 因 Pages 尚未启用返回 404；启用 workflow 发布源后重跑失败任务成功，无需修改网页代码。见 [Actions 证据](evidence/pages-actions-2026-10-13.json) 和 [Pages 设置](evidence/pages-settings-2026-10-13.json)。

线上首页显示八张卡牌；普通太阳系显示星空、太阳、轨道和标签，地球约 20 秒飞行完成后球体持续可见，β 回到 0，演示 Δτ 为 13.4 秒。进入地球阅读页并刷新深链接正常。Codex 内置 Chromium（Chrome/155.0.0.0）在实际线上 `/solar/render-check.html` 通过 48/48 项，0 项失败；页面和检查页没有新的控制台错误。见 [线上检查结果](evidence/pages-browser-check-2026-10-13.txt)、[检查截图](evidence/pages-browser-check-2026-10-13.png)、[地球抵达截图](evidence/pages-earth-2026-10-13.png)。覆盖范围为当前桌面 Chromium，未完成 Safari/Firefox、真实手机、低端 GPU 和长时间性能专项。

## 发布流程

1. 使用正常 GitHub 登录完成 Git 认证，不把密码、token 或 CLI 的临时授权文件放进项目。
2. 确认 origin 是上述仓库，先读取远端状态。空仓库可以推送 main；已有远端内容时先处理历史，不强推。
3. 仓库 Settings → Pages → Build and deployment → Source 选择 GitHub Actions。
4. 推送 main 后，在 Actions 确认目标提交的 verify、build、deploy 都成功。verify 执行 `bash verify.sh`，build 只上传 code/，deploy 使用 github-pages 环境。
5. 从成功部署输出或 Settings → Pages 取得实际网址，再验证首页、太阳系、地球飞行、地球阅读深链接刷新和 `/solar/render-check.html`。保存新的线上证据。

PR 只运行检查，不部署；非 main 分支手动运行也不部署。工作流只授予必要的 contents:read、Pages 读写与部署身份权限，不需要用户 token 写入 YAML。

## 后续更新

有可用系统 Git 后，在项目根目录执行 `git status` 确认变化，运行 `bash verify.sh`，再暂存需要更新的文件、提交并推送 main。浏览器 GPU 检查仍需单独运行。网页业务代码变化后，应按 HANDOFF 在实际线上网址验证，不能用离线检查代替画面验收。

本地启动步骤见 [本地运行流程](07-本地运行流程.md)。旧交付清单是打包快照，后续变化以 Git 记录为准。
