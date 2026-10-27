# Project Incoherence Fix & Modernization Plan

This plan addresses resource naming confusion, theme dependencies, and brings the app up to modern Android (API 34-36) compliance standards.

## Proposed Changes

### 1. Resource Organization
Clean up color definitions and establish local theme colors to remove reliance on library internals.

#### [NEW] [colors.xml](file:///C:/Users/TOUTENUN/Desktop/B3/android/app/src/main/res/values/colors.xml)
#### [DELETE] [ic_launcher_background.xml](file:///C:/Users/TOUTENUN/Desktop/B3/android/app/src/main/res/values/ic_launcher_background.xml)

### 2. Platform Compliance (Android 12+)
Add required metadata for backups and modern permissions.

#### [NEW] [backup_rules.xml](file:///C:/Users/TOUTENUN/Desktop/B3/android/app/src/main/res/xml/backup_rules.xml)
#### [NEW] [data_extraction_rules.xml](file:///C:/Users/TOUTENUN/Desktop/B3/android/app/src/main/res/xml/data_extraction_rules.xml)
#### [MODIFY] [AndroidManifest.xml](file:///C:/Users/TOUTENUN/Desktop/B3/android/app/src/main/AndroidManifest.xml)
- Add `android:dataExtractionRules` and `android:fullBackupContent`.
- Add `READ_MEDIA_VISUAL_USER_SELECTED` for partial media access (Android 14+).

### 3. Feature Stability
Enhance LAN Chat reliability.

#### [MODIFY] [MainActivity.java](file:///C:/Users/TOUTENUN/Desktop/B3/android/app/src/main/java/com/school/lanchat/MainActivity.java)
- Implement `MulticastLock` management to ensure Zeroconf (mDNS) discovery works consistently.

## Verification Plan
### Automated Tests
- Run `./gradlew assembleDebug` to verify build and resource integrity.
### Manual Verification
- Deploy to an emulator/device and check if the splash screen and primary colors render correctly.
