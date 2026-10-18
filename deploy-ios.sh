#!/usr/bin/env bash
set -e

# 极光影院 (Aurora Player) iOS 真机一键极速打包与部署脚本
# 适配机型：iPhone 11 Pro Max / iOS 18+

export DEVELOPER_DIR="/Users/xiaobin/Downloads/Xcode.app/Contents/Developer"
DEVICE_UDID="00008030-0009489A1A87802E"
BUNDLE_ID="xiaobin101685-163.com.TempTest"
CERT_IDENTITY="4ED10336D6DDC7236AB1E1976C57263029F31817"
XCODE_PROJ_DIR="/Users/xiaobin/Desktop/TempTest"
AURORA_DIR="/Users/xiaobin/ai-study/aurora-player"

echo "=========================================="
echo "🚀 步骤 1/4: 构建最新前端生产包 (Vite)..."
echo "=========================================="
cd "$AURORA_DIR"
npm run build

echo "=========================================="
echo "📦 步骤 2/4: 同步资源至 iOS 工程与 App 包..."
echo "=========================================="
# 1. 同步到 Xcode 工程 dist 目录
rsync -av --delete "$AURORA_DIR/dist/" "$XCODE_PROJ_DIR/dist/"

# 2. 定位真机 DerivedData 中的 TempTest.app
APP_DIR=$(find ~/Library/Developer/Xcode/DerivedData/TempTest-*/Build/Products/Debug-iphoneos -name "TempTest.app" | head -n 1)

if [ -z "$APP_DIR" ]; then
  echo "⚠️ 未找到现有编译产物，正在首次编译..."
  cd "$XCODE_PROJ_DIR"
  xcodebuild -project TempTest.xcodeproj -scheme TempTest -sdk iphoneos -configuration Debug build
  APP_DIR=$(find ~/Library/Developer/Xcode/DerivedData/TempTest-*/Build/Products/Debug-iphoneos -name "TempTest.app" | head -n 1)
fi

echo "🔄 更新 App Bundle 资源..."
rm -f "$APP_DIR"/index*.js "$APP_DIR"/index*.css "$APP_DIR"/assets/index*.js "$APP_DIR"/assets/index*.css 2>/dev/null || true
cp -r "$AURORA_DIR/dist/"* "$APP_DIR"/
cp "$AURORA_DIR/dist/assets/"* "$APP_DIR"/ 2>/dev/null || true

echo "🔨 编译最新 Swift 原生二进制 (含状态栏/横竖屏桥接)..."
SWIFTC="/Users/xiaobin/Downloads/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc"
IOS_SDK="/Users/xiaobin/Downloads/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS18.2.sdk"

"$SWIFTC" \
  -target arm64-apple-ios17.0 \
  -sdk "$IOS_SDK" \
  -O -whole-module-optimization \
  -o "$APP_DIR/TempTest" \
  "$XCODE_PROJ_DIR/TempTest/TempTestApp.swift" \
  "$XCODE_PROJ_DIR/TempTest/ContentView.swift"

# 注入新版 App 图标文件及 Info.plist 配置
python3 -c "
import plistlib
from PIL import Image

src_icon = '$AURORA_DIR/scripts/icon-gen/output/design_c_modern_minimal.png'
app_dir = '$APP_DIR'
info_path = f'{app_dir}/Info.plist'

img = Image.open(src_icon).convert('RGBA')
sizes = [
    (120, 120, 'AppIcon60x60@2x.png'),
    (180, 180, 'AppIcon60x60@3x.png'),
    (152, 152, 'AppIcon76x76@2x~ipad.png'),
    (167, 167, 'AppIcon83.5x83.5@2x~ipad.png'),
    (1024, 1024, 'AppIcon-1024.png'),
    (1024, 1024, 'AppIcon1024x1024.png')
]
for w, h, fname in sizes:
    img.resize((w, h), Image.Resampling.LANCZOS).save(f'{app_dir}/{fname}', 'PNG')

with open(info_path, 'rb') as f:
    data = plistlib.load(f)

data['CFBundleIcons'] = {
    'CFBundlePrimaryIcon': {
        'CFBundleIconFiles': ['AppIcon60x60'],
        'CFBundleIconName': 'AppIcon'
    }
}
data['CFBundleIcons~ipad'] = {
    'CFBundlePrimaryIcon': {
        'CFBundleIconFiles': ['AppIcon60x60', 'AppIcon76x76'],
        'CFBundleIconName': 'AppIcon'
    }
}
data['CFBundleIconFiles'] = [
    'AppIcon60x60@2x.png',
    'AppIcon60x60@3x.png',
    'AppIcon76x76@2x~ipad.png'
]

# 默认展示顶部状态栏（时间、信号、WiFi、电池电量），全屏播放时由 App 动态隐藏
data['UIStatusBarHidden'] = False
data['UIViewControllerBasedStatusBarAppearance'] = True

with open(info_path, 'wb') as f:
    plistlib.dump(data, f)
"

echo "=========================================="
echo "🔨 步骤 3/4: 代码签名与安全凭据绑定..."
echo "=========================================="
ENTITLEMENTS=$(find ~/Library/Developer/Xcode/DerivedData/TempTest-*/Build/Intermediates.noindex -name "TempTest.app.xcent" 2>/dev/null | head -n 1)
if [ -z "$ENTITLEMENTS" ]; then
  ENTITLEMENTS="/tmp/TempTest.entitlements"
  cat << 'EOF' > "$ENTITLEMENTS"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>application-identifier</key>
	<string>D9R8ARVJGJ.xiaobin101685-163.com.TempTest</string>
	<key>com.apple.developer.team-identifier</key>
	<string>D9R8ARVJGJ</string>
	<key>get-task-allow</key>
	<true/>
</dict>
</plist>
EOF
fi
codesign --force --sign "$CERT_IDENTITY" --entitlements "$ENTITLEMENTS" --timestamp=none "$APP_DIR"
codesign --verify --deep --strict "$APP_DIR"

echo "=========================================="
echo "📲 步骤 4/4: 安装并唤醒 iPhone 应用..."
echo "=========================================="
xcrun devicectl device install app --device "$DEVICE_UDID" "$APP_DIR"
xcrun devicectl device process launch --device "$DEVICE_UDID" "$BUNDLE_ID"

echo "=========================================="
echo "🎉 部署完成！极光影院已在 iPhone 上成功运行。"
echo "=========================================="
