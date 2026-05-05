# 奖励存折 (RewardList) - Android App

一款单机使用的"奖励存折"安卓应用，专为家庭或小团队设计。所有数据存储在本机，无需服务器，支持同一设备多账户登录。

## ✨ 功能特性

- **多账户支持**：同一手机可注册多组用户名和密码，独立使用
- **三类奖励**：金钱（¥）、礼物、情绪价值
- **奖励状态流转**：待兑现 → 已申请 → 已兑现
- **清单管理**：每位用户可创建多个奖励清单，邀请同设备其他用户作为"奖励人"
- **数据汇总**：按清单/状态/奖励人统计汇总
- **完全离线**：数据存储在手机本地 localStorage，零服务器依赖
- **密码安全**：使用 Web Crypto API（SHA-256 + 盐值哈希）存储密码

## 📦 安装

直接下载 `奖励存折.apk` 安装到 Android 6.0（API 23）及以上设备。

> 安装前需在手机设置中开启"允许安装未知来源应用"

## 🛠 技术栈

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS v4 + Framer Motion + Lucide React
- **打包**：Capacitor 7 (Android WebView)
- **数据存储**：WebView localStorage（本机持久化）
- **密码哈希**：Web Crypto API (SHA-256 + salt)

## 🔨 本地构建

### 环境要求
- Node.js 18+
- Java 17+
- Android SDK (API 34+)

### 步骤

```bash
# 安装依赖
npm install

# 构建 React 应用
npm run build

# 同步 Capacitor
npx cap sync android

# 构建 APK
cd android && ./gradlew assembleRelease
```

APK 输出路径：`android/app/build/outputs/apk/release/app-release.apk`

## 📄 许可

本项目采用 [CC BY-NC-SA 4.0](LICENSE) 许可证——**禁止商业用途**，允许在相同条件下分享和改编。
