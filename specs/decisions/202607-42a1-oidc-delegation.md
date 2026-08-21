---
type: decision
status: completed
title: 042a1 - 跨 App 調用導入 OIDC Token Relay 委託授權機制
---

# 042a1 - 跨 App 調用導入 OIDC Token Relay 委託授權機制

## Context (背景與動機)

在微服務/多 App 架構下，經常出現一個業務 App（例如 Wiki）需要代表「當前登入的真人使用者」去呼叫另一個業務 App（例如 Approve）提供的 API（例如查詢個人的審批狀態）。

在設計上，如果採用靜態的 M2M API Key 來做服務間授權：
1. 下遊 App 無法區分請求是由哪一個具體用戶發起的，破壞了審計鏈 (Audit Chain)。
2. 原本真人在下遊 App 擁有的權限邊界（RBAC）無法自然延續，可能導致越權漏洞。

我們需要一種能夠安全傳遞「真人身份與權限範圍」的跨 App 調用授權架構。

## Decision (決策細節)

我們決定導入以 Keycloak 為核心的 **OIDC Token Relay (權限委託)** 機制：

1. **Access Token 傳遞**：
   - 上游 App 在進行跨 App HTTP 呼叫時，在 HTTP `Authorization` Header 中直接攜帶當前真人用戶的 `JWT Access Token`。
2. **無狀態下游校驗**：
   - 下游 App 後端利用共享的 JWKS 校驗該 Token 的簽章、過期時間與 `aud`。
   - 解析 Token Claim 以提取該用戶的 Identity，並根據下游本地的 RBAC 權限配置來執行操作，不再需要發行額外的 API Key。
3. **委託庫封裝**：
   - 在共用套件 `@appspine/oidc-delegation` 中封裝此 Token 傳遞與 Header 注入邏輯，簡化開發流程。

## Consequences (影響與 Trade-offs)

### 優點
- **安全邊界統一**：下游 App 天然繼承了用戶的 RBAC 權限，避免了服務端越權。
- **審計日誌精確**：所有下游操作日誌都可以精確記錄到具體真人的用戶 ID，而非泛指的服務 ID。

### 缺點 / 折衷
- 要求上游 App 必須在用戶請求的 Session 上下文中存有有效的 Access Token，這在純異步背景任務中可能失效。對於異步任務調用，系統退回到使用 `@appspine/m2m-api-key` 的服務間 M2M 授權路徑。
