# MarketMesh mobile (Android)

Staff app for Malawian markets. Employees sign in with the login their company owner created for them and see only the work their role allows:

| Role | What the app shows |
| --- | --- |
| Cashier | **Sell**: point of sale (products, stock check, Cash / Airtel Money / TNM Mpamba / card / bank transfer, receipts), recent sales, read-only stock |
| Stock clerk | **Stock**: stock counts, receiving stock, damaged or lost stock, customer returns, movement history |
| Accountant | **Accounts**: cash book (income and expenses, totals) and till payments by method |
| Manager | Everything above, across every store |
| Owner | Everything |

Cashiers and stock clerks only see and work in the stores they are assigned to. All amounts are Malawi Kwacha (MK).

Owners create employee logins on the web app: **Employees → shield icon → Create login** (username, email, temporary password, roles, stores).

## Develop

```sh
cd mobile
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api   # Android emulator talking to the local API
flutter analyze
flutter test
```

Debug builds default to `http://10.0.2.2:3000/api` (the emulator's route to your machine). On a real phone, open **Server settings** on the sign-in screen and enter the API address.

## Production build

Release builds are AOT-compiled, obfuscated, tree-shaken, minified with R8 and resource-shrunk, and only talk to servers over **HTTPS**.

1. Create a signing key once and keep it safe. Losing it means you cannot update the app on the Play Store.

   ```sh
   keytool -genkeypair -v -keystore android/app/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias marketmesh
   ```

   Then create `android/key.properties` (both files are git-ignored):

   ```properties
   storePassword=...
   keyPassword=...
   keyAlias=marketmesh
   storeFile=upload-keystore.jks
   ```

   A release build refuses to run without this file; it never falls back to debug signing.

2. Build one APK per CPU architecture (smallest downloads), or an app bundle for the Play Store:

   ```sh
   flutter build apk --release --split-per-abi --obfuscate --split-debug-info=build/symbols --dart-define=API_URL=https://your-server/api
   flutter build appbundle --release --obfuscate --split-debug-info=build/symbols --dart-define=API_URL=https://your-server/api
   ```

   `--dart-define=API_URL` is optional. Without it the app asks for the server address on first launch. Keep `build/symbols` so crash reports can be de-obfuscated.

Outputs are in `build/app/outputs/flutter-apk/` and `build/app/outputs/bundle/release/`. Most phones need `app-arm64-v8a-release.apk`.

The app id is `mw.marketmesh.app`; version comes from `pubspec.yaml`. iOS is not set up: building for iPhone needs a Mac.
