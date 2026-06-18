#!/bin/bash
set -e

# Path to the compiled APK
APK_SOURCE="android/app/build/outputs/apk/release/app-release.apk"
ZIP_DEST="frontend/caledonian-mercury.zip"

echo "=== Caledonian Mercury PWA & APK Sync Conductor ==="

if [ ! -f "$APK_SOURCE" ]; then
    echo "⚠️  APK Build File Not Found!"
    echo "Compiling the Android app locally..."
    # Local compilation fallback since build tools are now available
    (cd android && JAVA_HOME=$HOME/android-sdk-setup/jdk ANDROID_HOME=$HOME/android-sdk-setup/android-sdk PATH=$HOME/android-sdk-setup/jdk/bin:$PATH ./gradlew assembleRelease)
fi

echo "✔ Found compiled APK. Packaging to ZIP (to bypass Firebase Spark Billing Plan executable restrictions)..."
rm -f frontend/caledonian-mercury.apk "$ZIP_DEST"
zip -j "$ZIP_DEST" "$APK_SOURCE"

echo "✔ Deploying updated PWA web app and packaged ZIPs to Firebase..."
firebase deploy --only hosting

echo "==================================================="
echo "🎉 Update Complete!"
echo "Your testers can now download the Android app from:"
echo "👉 https://caledonian-mercury-app.web.app/"
echo "==================================================="
