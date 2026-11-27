# Integrations

## Camera sources

The backend supports synthetic scenes, recorded fixtures, and OpenCV-compatible camera sources. Production RTSP URLs must be stored as protected configuration or encrypted credential references, not exposed in standard camera responses.

## C2 webhook

High-severity rule events are signed with HMAC-SHA256 and include an idempotency key, timestamp, site ID, and event payload. Delivery retries are tracked and failed deliveries enter a dead-letter queue. The current retry queue is process-local and must be made durable for production.

## Blockchain

The mock provider is deterministic and suitable for offline tests. The JSON-RPC provider can inspect transaction status, but live raw transaction submission and complete contract reads are not implemented. Production must add a signed relay, contract deployment, nonce management, confirmation policy, and reorg handling.

## Failure fallback

Camera workers isolate per-frame failures, local ledger operation continues without internet, and simulation is explicitly labelled. No fallback may silently convert an unavailable detector into a successful detector result.
