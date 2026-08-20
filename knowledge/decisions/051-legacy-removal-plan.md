---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 - 下一代 Major 版本 Legacy API 移除正式計畫 (Legacy Removal Plan)

> 本文件承接 [051-legacy-removal-proposal.md](051-legacy-removal-proposal.md)，將過渡期結束後的 Legacy 移除正式化為有明確里程碑、責任歸屬與驗收標準的後續工程計畫。  
> **嚴正聲明：本計畫屬於下一個 Major Release（v3.0.0）之獨立計畫，不包含在當前 2.0.0 發布執行範圍內。**

---

## 1. 計畫目標與範疇

在 2.0.0 完成發布並建立 Deprecation Telemetry 基準線後，本計畫旨在為下一個 Major Release 提供結構化移除路徑，達成：
1. 完全移除 `@appspine/auth` 門面套件。
2. 移除所有官方插件的 `@Global()` 相容性裝飾器。
3. 移除 `@appspine/frontend-shell` 中的過渡 Admin UI 元件。
4. 移除所有已被標記 `@deprecated` 的 Guard 與 Helper。

---

## 2. 執行里程碑與時程規劃 (Milestones)

```mermaid
gantt
    title Legacy API 移除計畫時程 (v3.0.0)
    dateFormat  YYYY-MM-DD
    section 準備期 (M1)
    開發 Backend Auth Codemod 工具        :m1_1, 2026-09-01, 10d
    建立 Codemod 驗證測試套件             :m1_2, after m1_1, 5d
    section 遷移期 (M2)
    全 Fleet (8 Apps) 執行 Codemod 遷移  :m2_1, 2026-09-16, 14d
    CI Telemetry 監控與基準線收斂 (歸零)   :m2_2, after m2_1, 7d
    section 移除期 (M3)
    appspine-packages 刪除 legacy exports :m3_1, 2026-10-07, 7d
    發布 3.0.0-canary 與全 Fleet 整合驗收  :m3_2, after m3_1, 7d
    發布 3.0.0 Stable Release              :m3_3, after m3_2, 3d
```

### 里程碑說明：
- **M1: 遷移工具就緒 (Migration Tooling Ready)**
  - 完成 `scripts/051-backend-auth-migration-codemod.mjs` 開發與 self-test。
  - 提供一鍵式將 `@appspine/auth` 轉換為 `@appspine/identity-core`、`@appspine/oidc-auth`、`@appspine/plugin-host-nest`、`@appspine/rbac` 的自動化轉換能力。
- **M2: 消費端全面收斂 (Consumer Fleet Zero-legacy)**
  - template + 8 個 App 依序套用 Frontend 與 Backend Codemods。
  - 每次套用後執行 `pnpm run verify:deprecation`，確保 telemetry 掃描數持續下降直至歸零（0 usages）。
- **M3: 正式移除與 Major 發布 (Clean Removal & Major Release)**
  - 於 `appspine-packages` 刪除 `packages/auth` 目錄。
  - 移除 `packages/rbac`、`packages/mcp-server`、`packages/m2m-api-key`、`packages/audit-log` 的 `@Global()` 裝飾器。
  - 發布 3.0.0 正式版本。

---

## 3. 驗收條件 (Acceptance Criteria)

1. **掃描歸零（Zero Usages）**：
   - 執行 `node scripts/051-pl5-13-deprecation-telemetry.mjs` 對 template + 8 個 App 掃描結果必須回傳 `0 legacy usages`。
2. **無未解全域依賴**：
   - 所有 Feature Module 皆明確宣告依賴或透過 Preset 組裝，移除 `@Global()` 後無任何 `UnknownDependenciesException`。
3. **編譯與型別全綠**：
   - 全 Fleet `pnpm build` 與 `pnpm typecheck` 零錯誤通過。

---

## 4. 計畫負責人與團隊 (Governance)

- **Platform Lead & Gatekeeper**: Sol max (G3)
- **Coordinator & Telemetry Tracker**: Gemini Coordinator
- **Codemod & Core Engineering**: Terra / Claude (G2)
- **Independent Auditor**: Claude Sonnet (G2/G3)
