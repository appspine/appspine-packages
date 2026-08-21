---
type: decision
status: completed
title: 003a - 建立 @appspine/* 共用 Monorepo 與 Changesets 發布機制
---

# 003a - 建立 @appspine/* 共用 Monorepo 與 Changesets 發布機制

## Context (背景與動機)

在開發早期，多個業務 App（Approve, Wiki, Calendar 等）擁有大量的重複程式碼（包括身份驗證、權限控制、審計日誌與 MCP 工具註冊等）。為了避免每個 App 各自重造輪子，並維持框架的一致性，我們需要將這些共用能力「套件化」。

當時面臨的選擇是：
- **方案 A**：每一個共用套件建立一個獨立的 Git Repository。
- **方案 B**：將所有共用套件放置在單一的 Monorepo 下，以 Workspace 方式管理。

由於共用套件之間互相依賴性極高（例如：RBAC 模組依賴 Auth 模組，Audit Log 模組被多個模組呼叫），方案 A 會導致跨套件修改時版本鏈條極度繁瑣且容易斷裂；而方案 B 則能實現跨套件的「原子修改」與聯合測試。

## Decision (決策細節)

我們決定採用 **方案 B**，具體架構決策如下：

1. **單一 Monorepo 結構**：
   - 建立共用套件專屬的 Monorepo `appspine-packages`。
   - 採用 `pnpm workspace` 管理 `@appspine/*` 下的多個套件（包括 `common`、`oidc-auth`、`rbac`、`m2m-api-key`、`audit-log`、`mcp-server` 等）。
2. **Changesets 版本治理**：
   - 使用 Changesets 工具鏈對每個套件實行獨立的語意化版本管理 (SemVer)，CI 流程自動過濾並發布至 GitHub Packages 私有 npm registry。
3. **15 套件深度清理 (048 決策)**：
   - 之後（在 048 階段），為了解決依賴過度膨脹，對 15 個套件實施了 strict unused 清理、統一 `files` 導出白名單、升級 `bcrypt` 並實施了 production 0 漏洞稽核門禁，確保了共用基礎設施的安全與穩健。

## Consequences (影響與 Trade-offs)

### 優點
- **極高的變更原子性**：開發者在 monorepo 內修改底層 common 套件時，可以直接同時更新上層套件的引用並進行一體化測試，極大簡化了開發流程。
- **標準化的出貨控制**：Changesets 讓版本升級與 CHANGELOG 生產非常清晰，避免了手動修改版本號可能導致的級聯依賴崩塌。

### 缺點 / 折衷
- Monorepo 本身要求較高的工具鏈配置（如 Turborepo/pnpm filter 規則），且下游 App 仍需要手動進行 npm package 升級。這已在後續的 051 插件化平台中透過 `plugin-cli` 進行了自動化組裝封裝。
