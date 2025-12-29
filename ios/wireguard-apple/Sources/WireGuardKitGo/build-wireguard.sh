#!/bin/bash
# WireGuard Go Bridge Build Script
# This script builds the WireGuard Go library for iOS
# It checks if the library already exists and skips if not needed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/out"
LIB_FILE="${OUT_DIR}/libwg-go.a"
VERSION_FILE="${OUT_DIR}/wireguard-go-version.h"

# Add Homebrew Go to PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Check if Go is available
if ! command -v go &> /dev/null; then
    echo "warning: Go not found in PATH. Checking if pre-built library exists..."
    if [ -f "${LIB_FILE}" ] && [ -f "${VERSION_FILE}" ]; then
        echo "Using pre-built libwg-go.a"
        exit 0
    else
        echo "error: Go is required to build WireGuard. Install with: brew install go"
        exit 1
    fi
fi

# For archive builds, use pre-built library if available
if [ "${ACTION}" = "install" ] || [ "${ACTION}" = "archive" ]; then
    if [ -f "${LIB_FILE}" ] && [ -f "${VERSION_FILE}" ]; then
        echo "Archive build: Using pre-built libwg-go.a"
        exit 0
    fi
fi

# Check if library needs rebuilding
if [ -f "${LIB_FILE}" ] && [ -f "${VERSION_FILE}" ]; then
    # Check if go.mod is newer than the library
    if [ "${SCRIPT_DIR}/go.mod" -ot "${LIB_FILE}" ]; then
        echo "libwg-go.a is up to date"
        exit 0
    fi
fi

echo "Building WireGuard Go library..."
cd "${SCRIPT_DIR}"

# Set up environment
export GOROOT="$(go env GOROOT)"
export GOPATH="${HOME}/go"

# Build with make
make "${ACTION:-build}" \
    ARCHS="${ARCHS:-arm64}" \
    PLATFORM_NAME="${PLATFORM_NAME:-iphoneos}" \
    SDKROOT="${SDKROOT:-$(xcrun --sdk iphoneos --show-sdk-path)}" \
    CONFIGURATION_BUILD_DIR="${OUT_DIR}"

echo "WireGuard Go library built successfully"
