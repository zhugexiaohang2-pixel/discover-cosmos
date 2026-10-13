# DiscoverCOSMOS GitHub 发布与维护

2026-10-13（Asia/Shanghai），用户已确认使用当前账号的公开仓库、公开 GitHub Pages，并在 main 每次更新且检查通过后自动部署。

## 当前状态

- 仓库：[zhugexiaohang2-pixel/discover-cosmos](https://github.com/zhugexiaohang2-pixel/discover-cosmos)，通过已登录的 Safari 创建；初始仓库为空，没有生成远端 README 或许可证。
- 本地 Git 基线：`91d432b9902d3180fc7afdd40e903b91760b6442`，只记录本项目 55 个文件，没有纳入父目录。origin 指向上述仓库。
- 提交署名使用用户确认的 GitHub 账号名及该账号设置中提供的隐私 noreply 邮箱，仅设置当前仓库。
- Apple 命令行工具尚在下载。首次基线使用临时安装的 isomorphic-git 1.44.2 创建标准 Git 对象；该工具没有加入 package.json，网页仍然没有安装依赖。
- 工作流已放入 [.github/workflows/pages.yml](../.github/workflows/pages.yml)，模板保持同一逻辑。官方 Actions 主版本已核对并更新为 checkout/setup-node v7、configure-pages v6、upload-pages-artifact/deploy-pages v5。
- [工作流结构证据](evidence/github-workflow-check-2026-10-13.txt) 只证明本地 YAML、检查门槛和权限结构通过；远端运行与公开网页尚待完成。

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
