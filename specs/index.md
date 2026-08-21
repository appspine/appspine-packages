# Specs Index - appspine-packages

## Living Specifications (SSoT Topics)

| 規格檔名 | 範疇 (Scope) | 狀態 | 標題與摘要 |
| --- | --- | --- | --- |
| [app-framework.md](topics/app-framework.md) | cross-repo | active | 業務系統開發框架 - 基本框架規劃 |
| [auth-architecture.md](topics/auth-architecture.md) | cross-repo | active | 身份驗證與授權架構 (Auth & SSO Architecture) 規格 |
| [dev-conventions.md](topics/dev-conventions.md) | cross-repo | active | App 開發規範 - 程式碼規範 |
| [domain-events.md](topics/domain-events.md) | cross-repo | active | 領域事件與事務 Outbox (Domain Events & Outbox) 規格 |
| [plugin-platform.md](topics/plugin-platform.md) | cross-repo | active | 插件平台 (Plugin Platform) 規格與架構指南 |

## Architectural Decisions (ADR)

| 決策檔案 | 狀態 | 標題與摘要 |
| --- | --- | --- |
| [202608-051a-plugin-platform.md](decisions/202608-051a-plugin-platform.md) | completed | 051a - appspine-packages 插件平台架構決策與收斂 |
| [202607-42a1-oidc-delegation.md](decisions/202607-42a1-oidc-delegation.md) | completed | 042a1 - 跨 App 調用導入 OIDC Token Relay 委託授權機制 |
| [202607-27b0-domain-events-outbox.md](decisions/202607-27b0-domain-events-outbox.md) | completed | 027b0 - 引入 PostgreSQL 事務性發送箱 (Outbox) 保障事件一致性 |
| [202607-035a-oidc-only-auth.md](decisions/202607-035a-oidc-only-auth.md) | completed | 035a - 廢止 Local Auth 全面切換為 OIDC SSO 單一登入 |
| [202607-003a-shared-packages.md](decisions/202607-003a-shared-packages.md) | completed | 003a - 建立 @appspine/* 共用 Monorepo 與 Changesets 發布機制 |

## Integration Contracts

| 契約檔案 | 類型 | 狀態 | 標題與摘要 |
| --- | --- | --- | --- |
| [compatibility-matrix.md](contracts/compatibility-matrix.md) | topic | active | Integration contract compatibility matrix |
