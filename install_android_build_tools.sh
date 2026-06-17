#!/bin/bash
set -e

# Setup directories
SETUP_DIR="$HOME/android-sdk-setup"
export JAVA_HOME="$SETUP_DIR/jdk"
export ANDROID_HOME="$SETUP_DIR/android-sdk"
export GRADLE_HOME="$SETUP_DIR/gradle"

echo "=== Auto-Installing Android Build Stack (Local User Directory) ==="
mkdir -p "$SETUP_DIR"
cd "$SETUP_DIR"

# 1. Download and Extract Java 17 (Temurin OpenJDK)
if [ ! -d "$JAVA_HOME" ]; then
    echo "📥 Downloading Java 17 (Temurin OpenJDK)..."
    curl -L -o openjdk.tar.gz "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jdk_x64_linux_hotspot_17.0.11_9.tar.gz"
    echo "📦 Extracting Java 17..."
    mkdir -p "$JAVA_HOME"
    tar -xzf openjdk.tar.gz -C "$JAVA_HOME" --strip-components=1
    rm openjdk.tar.gz
    echo "✔ Java installed successfully."
else
    echo "✔ Java already installed."
fi

# Add Java to current path for execution
export PATH="$JAVA_HOME/bin:$PATH"

# 2. Download and Extract Android Command Line Tools
if [ ! -d "$ANDROID_HOME/cmdline-tools" ]; then
    echo "📥 Downloading Android Command Line Tools..."
    curl -L -o cmdline.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
    echo "📦 Extracting Android Command Line Tools..."
    mkdir -p "$ANDROID_HOME/cmdline-tools/latest"
    unzip -q cmdline.zip
    # Move files to /latest to satisfy Android SDK root structure
    mv cmdline-tools/* "$ANDROID_HOME/cmdline-tools/latest/"
    rm -rf cmdline-tools cmdline.zip
    echo "✔ Android Command Line Tools installed."
else
    echo "✔ Android Command Line Tools already installed."
fi

# 3. Accept SDK licenses & Download Android SDK Platform 34 and Build Tools 34.0.0
echo "🔑 Accepting Android SDK licenses..."
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" --licenses || true

echo "📥 Installing Android SDK Platform 34, Build-Tools 34.0.0, and Platform-Tools..."
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" "platforms;android-34" "build-tools;34.0.0" "platform-tools"

# 4. Download and Extract Gradle
if [ ! -d "$GRADLE_HOME" ]; then
    echo "📥 Downloading Gradle 8.5..."
    curl -L -o gradle.zip "https://services.gradle.org/distributions/gradle-8.5-bin.zip"
    echo "📦 Extracting Gradle 8.5..."
    mkdir -p "$GRADLE_HOME"
    unzip -q gradle.zip
    mv gradle-8.5/* "$GRADLE_HOME/"
    rm -rf gradle-8.5 gradle.zip
    echo "✔ Gradle installed."
else
    echo "✔ Gradle already installed."
fi

# 5. Append environment variables to .bashrc for future sessions
echo "📝 Updating user profile path variables (.bashrc)..."
if ! grep -q "ANDROID_HOME" "$HOME/.bashrc"; then
    cat << 'EOF' >> "$HOME/.bashrc"

# Antigravity Android Build Toolchain
export SETUP_DIR="$HOME/android-sdk-setup"
export JAVA_HOME="$SETUP_DIR/jdk"
export ANDROID_HOME="$SETUP_DIR/android-sdk"
export GRADLE_HOME="$SETUP_DIR/gradle"
export PATH="$JAVA_HOME/bin:$GRADLE_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
EOF
    echo "✔ .bashrc updated successfully."
else
    echo "✔ Paths already present in .bashrc."
fi

echo "=================================================="
echo "🎉 Local Android Build Environment Setup Completed!"
echo "Java version: $(java -version 2>&1 | head -n 1)"
echo "Gradle version: $(gradle -v | grep 'Gradle ')"
echo "=================================================="
