# App Security and App Store Guidelines

## Purpose

This document summarizes practical security expectations and App Store review considerations for the app. It is intended as a working reference for product, engineering, and release preparation.

## App Security

### Data Protection

- Collect only the data required for the app's core features.
- Avoid storing sensitive data on-device unless it is strictly necessary.
- Use platform-secure storage for secrets, tokens, and credentials.
- Encrypt sensitive data in transit using HTTPS/TLS.
- Do not log access tokens, refresh tokens, API keys, passwords, or personally identifiable information.

### Authentication and Authorization

- Use short-lived access tokens where possible.
- Refresh tokens should be stored securely and rotated when supported.
- Validate user permissions on the server, not only in the client.
- Handle logout by clearing local session data and invalidating server-side sessions when available.
- Protect account-related actions such as deletion, subscription changes, and profile updates with appropriate confirmation flows.

### API and Backend Security

- Validate all user input on the server.
- Use rate limiting for authentication, payment, upload, and AI-generation endpoints.
- Restrict privileged operations to trusted server-side code.
- Keep service-role keys and private credentials out of the mobile app bundle.
- Use least-privilege policies for database access, storage buckets, and serverless functions.

### Privacy

- Clearly explain what user data is collected and why.
- Request platform permissions only when the related feature is used.
- Provide meaningful permission prompts that match the feature being accessed.
- Respect user choices when permissions are denied.
- Support account deletion and data deletion flows where required.

### Payments and Subscriptions

- Use Apple's in-app purchase system for digital goods, premium content, and app-based subscriptions.
- Do not unlock digital features through external payment links inside the iOS app.
- Keep entitlement checks server-verified where possible.
- Handle subscription expiration, cancellation, billing retry, grace periods, and restore purchases.
- Avoid hard-coding subscription state in the client.

### AI and Generated Content

- Do not expose private API keys in the app.
- Route AI requests through a controlled backend when secrets or policy enforcement are required.
- Add abuse prevention for generation endpoints.
- Avoid generating or displaying unsafe, discriminatory, sexual, violent, or illegal content.
- Provide user reporting or support paths when user-generated or AI-generated content can affect others.

### Secure Development Practices

- Keep dependencies current and remove unused packages.
- Review native permissions before each release.
- Run static checks, type checks, and tests before submission.
- Use environment-specific configuration for development, staging, and production.
- Review analytics, crash reporting, and debugging tools to ensure they do not collect unnecessary sensitive data.

## App Store Guidelines

### Core Review Expectations

- The app should be stable, complete, and free of obvious crashes.
- All visible features should work as described in App Store metadata.
- Demo accounts or review instructions should be provided when reviewers need access to gated content.
- Placeholder content, broken links, debug screens, and test labels should be removed from production builds.
- The app should not mislead users about functionality, pricing, privacy, or results.

### Version Update Enforcement

- Check whether the user's installed app version is up to date against the latest supported production version.
- If the installed version is outdated, show a clear update message that guides the user to the App Store listing.
- Use a non-blocking update prompt for optional updates and a blocking prompt only when the old version is no longer supported.
- Keep the minimum supported version controlled remotely so urgent security, backend, or compatibility issues can be handled without shipping another binary first.
- Make the update flow resilient if the version-check service is unavailable; avoid locking users out because of a transient network failure.

### Privacy and Permissions

- App privacy labels must accurately reflect collected data and tracking behavior.
- The privacy policy URL should be available and accurate.
- Permission prompts should be tied to clear user-facing functionality.
- Tracking requires explicit App Tracking Transparency permission when applicable.
- Data collection should match what is disclosed in the app, privacy policy, and App Store Connect.

### Subscriptions and In-App Purchases

- Subscription pricing, duration, renewal behavior, and included benefits must be clear before purchase.
- Users must be able to restore purchases.
- Premium features should not appear falsely available to non-paying users.
- External payment methods cannot be promoted for digital goods inside the iOS app.
- App Store metadata should accurately describe subscription features and limitations.

### User-Generated Content

- Apps with user-generated content should include moderation, reporting, blocking, or filtering as appropriate.
- Terms of use should prohibit abusive, illegal, or harmful content.
- Public content should have a path for removal or escalation.
- The app should protect users from harassment, scams, and objectionable material.

### Account and Data Deletion

- If account creation is supported, account deletion should also be available.
- Deletion flows should be easy to find and should not require unnecessary extra steps.
- Users should understand what data is deleted, retained, or anonymized.
- Backend deletion behavior should match what the app tells users.

### Metadata and Marketing Claims

- Screenshots should reflect the actual app experience.
- App name, subtitle, keywords, and description should not include misleading claims.
- Avoid unsupported claims about learning outcomes, health, finance, or guaranteed results.
- Any third-party trademarks, content, or media should be licensed or used with permission.
- Age rating should match the app's actual content and capabilities.

### Accessibility and Usability

- Text should be readable at supported device sizes.
- Core flows should remain usable with Dynamic Type where practical.
- Interactive controls should have accessible labels.
- Color should not be the only way to communicate important state.
- Onboarding should not block access unnecessarily unless required for account, safety, or payment reasons.

## Release Readiness Checklist

- [ ] Production environment variables are configured.
- [ ] No private keys or service-role credentials are bundled in the app.
- [ ] Login, logout, account deletion, and restore purchases have been tested.
- [ ] Privacy policy and App Store privacy labels are up to date.
- [ ] App permissions match actual feature usage.
- [ ] Subscription copy clearly explains price, renewal, and benefits.
- [ ] Review notes include test account details if needed.
- [ ] Crash-free smoke test completed on a physical device or simulator.
- [ ] Analytics and logs do not expose sensitive user data.
- [ ] App Store screenshots and description match the submitted build.
- [ ] App version check is implemented, and outdated users are guided to update through the App Store.

## Useful References

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Apple Developer Program License Agreement: https://developer.apple.com/support/terms/
- App Store Connect Help: https://developer.apple.com/help/app-store-connect/
