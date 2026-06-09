# User Mistake Logs

Nuances installs a lightweight alert logger at app startup through `installUserMistakeAlertLogger()`.

The logger records user-facing mistake/error alerts such as missing login, denied permissions, invalid input, cache limits, failed purchases/restores, and network failures. It stores the latest 200 entries in `AsyncStorage` under `nuances_user_mistake_log_v1` and prints each redacted entry as `[UserMistakeLog]` in the device/debug console.

Sensitive values are redacted before storage or console output:

- Bearer/JWT-like tokens
- email addresses
- URL query values named `access_token`, `refresh_token`, `id_token`, `api_key`, `secret`, or `password`

During debugging, the logs can be read from the JS runtime:

```js
await globalThis.NuancesUserMistakeLog.get()
```

Clear stored logs:

```js
await globalThis.NuancesUserMistakeLog.clear()
```
