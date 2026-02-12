#!/bin/bash
# Bash script to generate self-signed code signing certificate for macOS
# Run: chmod +x scripts/generate-certificates-mac.sh
# Then: ./scripts/generate-certificates-mac.sh

set -e

echo "========================================"
echo "Reviewer 2 - macOS Certificate Generator"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Prompt for certificate password
echo -e "${YELLOW}Enter a password for the certificate (min 8 characters):${NC}"
read -s CERT_PASSWORD
echo ""

if [ ${#CERT_PASSWORD} -lt 8 ]; then
    echo -e "${RED}ERROR: Password must be at least 8 characters long${NC}"
    exit 1
fi

echo -e "${GREEN}Creating self-signed certificate...${NC}"

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CERTS_DIR="$SCRIPT_DIR/../build/certs"

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Certificate details
CERT_NAME="Reviewer2 Developer"
KEYCHAIN_NAME="reviewer2-build"
KEYCHAIN_PASSWORD="$CERT_PASSWORD"

# Create temporary keychain
KEYCHAIN_PATH="$HOME/Library/Keychains/${KEYCHAIN_NAME}.keychain-db"

echo -e "${YELLOW}Creating temporary keychain...${NC}"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_NAME.keychain"
security set-keychain-settings -t 3600 -l "$KEYCHAIN_NAME.keychain"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_NAME.keychain"

# Add keychain to search list
security list-keychains -d user -s "$KEYCHAIN_NAME.keychain" login.keychain

# Generate self-signed certificate using OpenSSL
CERT_KEY="$CERTS_DIR/certificate.key"
CERT_CRT="$CERTS_DIR/certificate.crt"
CERT_P12="$CERTS_DIR/certificate.p12"

echo -e "${YELLOW}Generating RSA key pair...${NC}"
openssl genrsa -out "$CERT_KEY" 2048

echo -e "${YELLOW}Creating certificate signing request...${NC}"
openssl req -new -key "$CERT_KEY" -out "$CERTS_DIR/certificate.csr" -subj "/CN=$CERT_NAME/O=Reviewer2/C=US"

echo -e "${YELLOW}Generating self-signed certificate...${NC}"
openssl x509 -req -days 1825 -in "$CERTS_DIR/certificate.csr" -signkey "$CERT_KEY" -out "$CERT_CRT"

echo -e "${YELLOW}Exporting to PKCS12 format...${NC}"
openssl pkcs12 -export -out "$CERT_P12" -inkey "$CERT_KEY" -in "$CERT_CRT" -password "pass:$CERT_PASSWORD"

# Import certificate into keychain
echo -e "${YELLOW}Importing certificate into keychain...${NC}"
security import "$CERT_P12" -k "$KEYCHAIN_NAME.keychain" -P "$CERT_PASSWORD" -T /usr/bin/codesign -T /usr/bin/productbuild

# Trust the certificate for code signing
echo -e "${YELLOW}Setting certificate trust...${NC}"
CERT_SHA1=$(openssl x509 -in "$CERT_CRT" -fingerprint -sha1 -noout | cut -d'=' -f2 | tr -d ':')
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_NAME.keychain" 2>/dev/null || true

echo -e "${GREEN}Certificate created successfully!${NC}"
echo ""

# Generate base64 for GitHub Secret
echo -e "${YELLOW}Generating base64 encoded certificate for GitHub Secret...${NC}"
BASE64_CERT=$(base64 -i "$CERT_P12")

# Save to file
BASE64_FILE="$CERTS_DIR/certificate.p12.base64"
echo "$BASE64_CERT" > "$BASE64_FILE"

# Copy to clipboard (macOS)
echo "$BASE64_CERT" | pbcopy

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}GitHub Secrets Configuration${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${YELLOW}1. Go to your GitHub repository${NC}"
echo -e "${YELLOW}2. Navigate to: Settings → Secrets and variables → Actions${NC}"
echo -e "${YELLOW}3. Click 'New repository secret'${NC}"
echo ""
echo -e "${NC}Create the following secrets:${NC}"
echo ""
echo -e "${CYAN}Secret Name: MAC_CSC_LINK${NC}"
echo -e "${GREEN}The base64 certificate has been copied to your clipboard!${NC}"
echo -e "${YELLOW}(If not, it's also saved to: $BASE64_FILE)${NC}"
echo ""
echo -e "${CYAN}Secret Name: MAC_CSC_KEY_PASSWORD${NC}"
echo -e "${NC}Secret Value: $CERT_PASSWORD${NC}"
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${RED}IMPORTANT SECURITY NOTES${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${GREEN}✓ Certificate saved to: $CERT_P12${NC}"
echo -e "${RED}✗ NEVER commit this file to Git!${NC}"
echo -e "${GREEN}✓ .gitignore already excludes *.p12 files${NC}"
echo -e "${GREEN}✓ Only store base64 version in GitHub Secrets (encrypted)${NC}"
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${YELLOW}User Experience Notes${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${YELLOW}⚠ Users will see 'unidentified developer' warning${NC}"
echo -e "${YELLOW}⚠ First launch requires: Right-click → Open${NC}"
echo -e "${YELLOW}⚠ Or run: xattr -cr '/Applications/Reviewer 2.app'${NC}"
echo -e "${YELLOW}⚠ Auto-update will NOT work without Apple notarization${NC}"
echo ""
echo -e "${NC}For production use, consider:${NC}"
echo -e "${NC}- Apple Developer Account: \$99/year${NC}"
echo -e "${NC}- Benefits: No warnings, auto-update support, App Store distribution${NC}"
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${YELLOW}Keychain Management${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${NC}Temporary keychain created: $KEYCHAIN_NAME.keychain${NC}"
echo -e "${NC}To remove after uploading to GitHub:${NC}"
echo -e "${YELLOW}security delete-keychain $KEYCHAIN_NAME.keychain${NC}"
echo ""
echo -e "${GREEN}Certificate generation complete!${NC}"

# Clean up temporary files
rm -f "$CERTS_DIR/certificate.csr"

echo ""
echo -e "${YELLOW}Testing certificate...${NC}"
echo -e "${NC}Available code signing identities:${NC}"
security find-identity -v -p codesigning "$KEYCHAIN_NAME.keychain" 2>/dev/null || echo -e "${YELLOW}Note: Run 'security unlock-keychain $KEYCHAIN_NAME.keychain' if needed${NC}"
echo ""
