---
type: decision
status: completed
title: 035a - 廢止 Local Auth 全面切換為 OIDC SSO 單一登入
---

# 035a - 廢止 Local Auth 全面切換為 OIDC SSO 單一登入

## Context (背景與動機)

在開發早期，`appspine` 的驗證套件 `@appspine/auth` 同時支持 `local` (本地帳號密碼，由 bcrypt 雜湊與本地資料庫儲存) 與 `oidc` (外部單一登入) 雙模式。

然而，在盤點approve、wiki、project、calendar、chat 等多個業務 App 專案後，我們發現大部分 App 實際上都只在使用 local 模式，導致每個 App 都各自擁有一套帳號管理與登入註冊 UI，無法達到企業級 SSO 單一登入的統一管理效果。

為了解耦身份驗證、簡化 App 架構並引入企業級認證安全，我們面臨將認證方式統一的決策。

## Decision (決策細節)

我們拍板了以下決策：

1. **全面廢止 Local Auth**：
   - 彻底移除 bcrypt 本地密碼雜湊與比對邏輯、註冊與登入的表單程式碼路徑，不再保留雙軌模式切換。
2. **統一 OIDC 單一登入**：
   - 以外部 IdP (Keycloak) 作為唯一的真人身份來源。
   - 引入 Just-In-Time (JIT) Onboarding 機制，當用戶首次登入時，若本地不存在該用戶，則由 JWT 中的 Claim 自動建立本地 User，解決用戶 onboarding 的繁瑣流程。
3. **引入 OIDC Delegation (042 決策)**：
   - 同步規範了真人代表跨 App 呼叫的委託機制 (Relay Access Token)，使下游服務天然繼承真人的權限邊界。

## Consequences (影響與 Trade-offs)

### 優點
- **極致的安全與簡化**：各業務 App 剔除了所有敏感的密碼儲存與帳密驗證邏輯，App 本身代碼量大幅精簡。
- **真正的單一登入 (SSO)**：用戶只需在 Keycloak 登入一次即可通行所有 App，運維人員也能夠在中央控制台對所有用戶的安全權限進行統一管理與吊銷。

### 缺點 / 折衷
- 本機開發時需要啟動本地的 Keycloak 容器（由 `dev-infra/` 統一維運），這相較於過去直接寫死 mock 用戶，增加了開發環境的初始化成本。但為了解決多 App 間認證割裂的重大問題，此折衷是完全值得且必要的。
