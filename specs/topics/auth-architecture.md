---
type: topic
scope: cross-repo
status: active
created: 2026-08-21
updated: 2026-08-21
---

# 身份驗證與授權架構 (Auth & SSO Architecture) 規格

本文件記錄 `appspine` 生態系中統一的身份驗證、單一登入（SSO）、跨 App 權限委任調用的技術規格。

---

## 一、 OIDC-Only 單一登入

`appspine` 廢止了所有本地帳號密碼登入機制，全面強制採用以 **OpenID Connect (OIDC)** 為基礎的單一登入架構。

### 1.1 核心機制
- **IdP (身份識別提供者)**：系統以 Keycloak 作為標準 IdP，為所有業務 App 提供統一的登入介面與憑證管理。
- **JWT 驗證**：業務 App 後端使用 `@appspine/oidc-auth` 套件，透過解析 Keycloak 的 JWKS (JSON Web Key Set) 公鑰，對傳入的 Bearer Token 進行無狀態的簽章校驗與過期檢驗。
- **JIT (Just-In-Time) Onboarding**：當使用者首次登入某個 App 且本地 `User` 表查無此人時，後端會利用 JWT Claim 中的資訊（`email`、`name`、`sub`）自動在本地 `User` 表中建立用戶記錄（即時配置），保障流暢的註冊登入一體化體驗。

---

## 二、 安全強化規則 (Audience & AZP Validation)

為防止憑證劫持與 Token 濫用，OIDC JWT 驗證導入了嚴格的受眾校驗：

1. **`aud` (Audience) 檢驗**：
   - App 後端必須檢驗 JWT 中的 `aud` 欄位是否包含該 App 的 Client ID。若受眾不符，直接拒絕請求。
2. **`azp` (Authorized Party) 檢驗**：
   - 檢驗 Token 發行方是否為合法的客戶端 App。若 `azp` 與 `aud` 皆不符預期，視為非法傳輸。

---

## 三、 跨 App 真人委任調用 (OIDC Delegation)

當業務 App A（例如 Wiki）需要代表「當前已登入的真人用戶」呼叫業務 App B（例如 Approve）時，系統採用 **Token Relay** 模式進行權限委任：

### 3.1 委任調用流程

```text
+----------+              +------------+              +------------+
|  User    |  1. Login    |   App A    |  2. Relay    |   App B    |
|  Browser |------------->| (e.g. Wiki)|------------->| (e.g. Appr)|
+----------+              +------------+              +------------+
      |                         |                           |
      +----[ JWT Access Token ]-+                           |
      |                                                     |
      +-------------------------[ JWT Access Token ]--------+
```

1. 用戶登入 App A，瀏覽器持有由 Keycloak 簽發的真人 `JWT Access Token`。
2. App A 在呼叫 App B 的 HTTP 請求中，於 `Authorization` Header 中直接攜帶該真人的 `JWT Access Token`。
3. App B 接收請求後，將其視為真人直接請求，進行 JWT 校驗，並根據該真人的權限（RBAC）執行業務操作。
4. **優勢**：下游 App B 不需要額外發行 M2M API Key，天然繼承了真人的權限邊界與審計日誌。
