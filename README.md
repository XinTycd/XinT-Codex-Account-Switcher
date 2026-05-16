# 芯添Codex账号切换器（XinT-Codex-Account-Switcher）

一个 `Codex` 账号档案切换器，用于管理多个 `Codex` 账号，并在不同账号之间快速切换。

本项目适合需要频繁切换不同账号、测试不同套餐额度、或对 `Codex` 本地登录状态做备份管理的用户。

## 作者信息

- 作者：`XinTycd`
- 项目名称：`XinT-Codex-Account-Switcher`
- 项目协议：`Apache License 2.0`
- 版权归属：`Copyright (c) 2026 XinTian-Tech`

## 开源说明

本项目不允许任何商业行为，仅允许用户学习、测试使用，因违规使用导致账号异常均与本项目作者无关。
进行二次开发需保留`XinT-Codex-Account-Switcher` `XinT` `XinTian-Tech` 等字样。

## 项目简介

`XinT-Codex-Account-Switcher` 的核心思路不是多开客户端，而是对本机 `~/.codex` 目录中的关键认证文件做“档案化快照”管理。

当你切换账号时，程序会自动：

1. 关闭当前 `Codex`
2. 备份当前本地登录状态
3. 写入目标账号档案
4. 按需重启 `Codex`

这样可以在不改动 `Codex` 自身逻辑的前提下，实现多个账号之间的快速切换。

## 功能特性

- 支持保存当前 `Codex` 已登录状态为账号档案
- 支持通过网页 `OAuth` 授权方式添加账号
- 支持通过导入 `auth.json` 添加账号
- 支持一键切换账号，并自动备份切换前状态
- 支持显示账号套餐类型
- 支持显示 `5 小时额度` 与 `一周额度`
- `FREE` 套餐自动只显示一周额度
- 支持账号档案重命名
- 支持账号档案删除
- 支持账号档案拖拽排序，并持久保存顺序
- 支持浅色 / 深色主题切换
- 支持检测 `Codex` 运行状态并一键重启
- 支持启动后自动刷新额度
- 支持每 `30` 秒静默刷新额度
- 支持手动强制刷新全部账号额度

## 界面说明

当前程序首页以“账号档案”作为主视图，核心交互包括：

- 顶部工具区
  - 主题切换
  - 当前状态弹窗
  - 重启 `Codex`
  - 打开档案目录
- 档案区
  - 刷新全部额度
  - 添加账号
  - 档案卡片列表
- 添加账号弹窗
  - 网页 `OAuth` 授权登录
  - 保存当前 `Codex` 登录状态
  - 导入 `auth.json`

## 工作原理

程序会跟踪并快照以下 `Codex` 关键文件：

- `auth.json`
- `.codex-global-state.json`
- `config.toml`
- `installation_id`
- `cap_sid`

每个账号档案本质上是以上文件的一份快照副本，并附带一个 `metadata.json` 用于保存：

- 档案名称
- 套餐类型
- 账号标识
- 额度缓存
- 排序信息
- 更新时间

切换账号时，程序不是“登录新账号”，而是“恢复目标档案快照”。

## 支持的账号添加方式

### 1. 网页 OAuth 授权登录

适合直接新增一个账号。

程序会打开官方登录页，使用本地回调地址完成授权：

- `http://localhost:1455/auth/callback`

当前使用的相关地址：

- 授权包装页：`https://chatgpt.com/codex/desktop-auth`
- 令牌端点：`https://auth.openai.com/oauth/token`
- 额度接口：`https://chatgpt.com/backend-api/wham/usage`

### 2. 保存当前 Codex 已登录状态

适合你已经在本机 `Codex` 客户端中登录好了目标账号，只需要把当前状态保存成一个可切换档案。

### 3. 导入 auth.json

适合以下场景：

- 从其他设备迁移账号状态
- 使用已有备份恢复账号
- 导入其他环境中的认证文件

## 额度刷新策略

为兼顾速度与资源占用，当前版本采用以下刷新策略：

- 程序启动后立即刷新一次额度
- 程序运行过程中每 `30` 秒自动静默刷新一次
- 点击刷新按钮时，强制重查所有账号额度
- 如果刷新失败，保留旧额度显示，不直接清空

## 项目结构

```text
.
├─ assets/                         图标资源
├─ dist/                           打包产物
├─ scripts/                        辅助脚本
├─ src/
│  ├─ core/
│  │  ├─ auth-store.js             认证读写、令牌刷新、额度接口
│  │  ├─ codex-control.js          Codex 进程控制
│  │  ├─ oauth-login.js            网页 OAuth 流程
│  │  ├─ profile-manager.js        档案快照与切换
│  │  ├─ profile-usage.js          额度刷新与缓存
│  │  └─ rate-limits.js            额度数据解析
│  ├─ index.html                   页面结构
│  ├─ main.js                      Electron 主进程
│  ├─ preload.js                   预加载桥接
│  ├─ renderer.js                  前端交互逻辑
│  └─ styles.css                   页面样式
├─ test/                           测试
├─ package.json
└─ README.md
```

## 运行环境

- Windows
- Node.js `24+`
- npm

## 本地开发

### 安装依赖

```powershell
npm install
```

### 启动开发模式

```powershell
npm start
```

### 运行测试

```powershell
npm test
```

### 生成程序图标

```powershell
npm run generate:icon
```

### 打包便携版

```powershell
npm run package
```

## 打包产物

当前默认打包为 Windows portable：

- `XinT Codex Account Switcher 0.1.0.exe`

默认输出目录：

- dist

## 测试覆盖

当前测试主要覆盖：

- OAuth 链接构造
- 档案创建与列出
- 自动命名
- 档案恢复与备份
- 重命名
- 手动排序后保持顺序
- 刷新失败时保留旧额度
- 额度窗口解析

测试文件：

- [test/oauth-login.test.js](<./test/oauth-login.test.js>)
- [test/profile-manager.test.js](<./test/profile-manager.test.js>)
- [test/rate-limits.test.js](<.test/rate-limits.test.js>)

## 已知限制

- 本项目依赖 `Codex` 当前仍将关键认证状态保存在 `~/.codex`
- 如果官方后续调整本地认证文件位置，需要同步更新跟踪文件列表
- 如果某个账号的 `refresh_token` 已失效，额度读取会失败，需要重新登录或重新导入
- 如果官方 OAuth 或额度接口发生变化，需要调整相关实现
- 当前构建目标为 Windows portable，不包含安装器版本

## 适用场景

- 一个设备上需要频繁切换多个 `Codex` 账号
- 需要对多个账号套餐额度进行集中查看
- 需要保留多个本地登录状态快照
- 需要降低手动替换 `~/.codex` 文件的操作成本

## 后续计划

- 更完善的错误提示与诊断信息
- 更稳定的 OAuth 授权流程适配
- 更细的额度信息展示
- 档案导出 / 导入增强
- 安装版构建支持

## 免责声明

本项目为基于本地 `Codex` 状态管理思路实现的第三方桌面工具，不属于 OpenAI 官方账号管理产品。
