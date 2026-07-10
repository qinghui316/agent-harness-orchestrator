# Provider Golden Project

This is a minimal HTTP service used for AHO provider acceptance. It currently
supports `GET /` and has one Node test. A realistic acceptance demand is:

> Add `GET /healthz` returning HTTP 200 and `{ "status": "ok" }`, and add a
> regression test without changing the existing root route.
