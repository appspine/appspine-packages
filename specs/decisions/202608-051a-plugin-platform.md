---
type: decision
status: completed
title: 051a - appspine-packages 插件平台架構決策與收斂
---

# 051a - appspine-packages 插件平台架構決策與收斂

## Context (背景與動機)

在 `appspine` 發展早期，共用能力以普通的 npm 套件（如 `@appspine/auth`、`@appspine/rbac` 等）存在。這導致消費端業務 App（Host）在整合共用功能時，必須手動在 `AppModule`、Next.js 路由、Prisma schema、環境變數與 RBAC 權限表等 5~6 個接線點進行大量手工接線。

這帶來了多個痛點：
1. 整合繁瑣，容易發生接線遺漏。
2. 各套件間的隱性依賴（如 RBAC 依賴 Auth）缺乏靜態檢查，衝突往往在執行期才爆發。
3. 重複代碼散落在各業務 App 中，升級和維護成本極高。

因此，決定將現有的 `@appspine/*`「套件化框架」重構演進為統一的**建置期插件平台 (Plugin Platform)**。

## Decision (決策細節)

我們採取了以下核心技術架構決策：

1. **雙軌聲明與組裝**：
   - 插件來源與配置宣告於 `appspine.plugins.json`。
   - NestJS、Next.js 與 Prisma schema 一律在**建置期 (Build-time) 靜態組裝**。
   - 不支援、也不追求執行期的熱插拔 (Hot reload) 或遠端未知程式碼動態下載，以確保安全性與 TypeScript 型別完整。

2. **五大開發階段的重構路徑 (PL0 ~ PL5)**：
   - **PL0 (基準盤點)**：定義套件角色與命名規約，確定 Host-Preset-Plugin 層級拓撲。
   - **PL1 (平台核心)**：實現 Manifest 機制、相依解析與 Host 開機驗證。將舊的 `@appspine/auth` 拆分為單純的 `@appspine/oidc-auth` 與核心 identity。
   - **PL2 (CLI & Prisma 合併)**：實作 `plugin-cli`，並引入 `Prisma owns/augments` 編譯器，實現建置期 Prisma schema 自動組合。
   - **PL3 (前端 Slots 機制)**：在前端導入插槽組裝模式，由 generator 自動產生 Next.js slots wiring。
   - **PL4 (全套件遷移)**：將官方現存的 `notification`、`rbac`、`m2m-api-key`、`domain-events` 等套件重構為符合規範的插件。
   - **PL5 (全生態發布與上線)**：透過 Canary 發布，全面更新業務 app 艦隊，讓舊 knowledge 退場，完成上線。

3. **強一致性防呆**：
   - 導入 `appspine.plugin-lock.json`（類似 package-lock.json）鎖定最終組裝配置。
   - 提供 `plugin-cli doctor` 進行靜態診斷，在建置和 CI 階段提早阻擋 broken refs。

## Consequences (影響與 Trade-offs)

### 優點
- **極簡安裝**：新 App 安裝 Presets 或插件後，只需執行 `pnpm plugin-cli build` 即可自動完成接線。
- **高安全性與高效率**：靜態組裝保留了 Next.js SSR、Tree Shaking 以及 Prisma 強型別的所有優勢，並將錯誤排查提前至建置期與 CI 門禁。
- **治理清晰**：Manifest 讓每個插件的權限要求、所需的 secrets 一目了然。

### 缺點 / 折衷
- **非動態加載**：如果新增或停用插件，App 必須重啟並重構 build，不適用於要求 runtime 熱插拔的場景。但對於企業內部的協作平台（Wiki、Calendar 等），這是完全可以接受的權衡。
