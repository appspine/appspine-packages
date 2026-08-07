# Webhook Protocol v2

The v2 signature is computed over the raw request body and the binding metadata:

```text
v2
<UPPERCASE_METHOD>
<PATH_AND_QUERY>
<TIMESTAMP>
<EVENT_ID>
<CAPABILITY_ID>
<CAPABILITY_VERSION>
<BINDING_ID>
<BINDING_VERSION>
<SHA256_RAW_BODY>
```

Required headers are `X-Appspine-Webhook-Version`, `X-Appspine-Key-Id`, `X-Appspine-Event-Id`,
`X-Appspine-Capability-Id`, `X-Appspine-Capability-Version`, `X-Appspine-Binding-Id`,
`X-Appspine-Binding-Version`, `X-Appspine-Timestamp`, and `X-Appspine-Signature`.

Receivers verify raw bytes before JSON parsing, enforce a bounded freshness window and body size,
resolve the key by destination and key ID, compare HMAC values in constant time, and fail closed on
source, capability, binding, key, timestamp, or signature mismatch. Key rotation may accept the
previous key only inside its explicit overlap window.

Senders use an exact destination key, HTTPS in production, no redirects, an allowlist, and DNS
resolution checks that reject loopback, private, link-local, multicast, unspecified, metadata, and
IPv4-mapped private addresses. DNS rebinding is handled by checking every resolved address before
the request.
