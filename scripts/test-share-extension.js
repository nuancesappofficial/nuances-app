#!/usr/bin/env node

/**
 * 測試 Share Extension Config Plugin
 * 
 * 執行方式：
 * node scripts/test-share-extension.js
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Share Extension Setup...\n');

// 檢查檔案是否存在
const files = [
  'plugins/withShareExtension.js',
  'app.json',
  'src/services/shareExtension/shareExtensionService.ts',
  'src/services/clipboard/clipboardService.ts',
  'src/hooks/useShareExtension.ts',
  'src/database/schema.js',
  'src/database/models/CachedItem.ts',
  'src/database/migrations/index.ts',
];

let allPassed = true;

files.forEach((file) => {
  const fullPath = path.join(__dirname, '..', file);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - NOT FOUND`);
    allPassed = false;
  }
});

console.log('\n📋 Checking app.json configuration...');

const appJsonPath = path.join(__dirname, '..', 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

if (appJson.expo.plugins && appJson.expo.plugins.includes('./plugins/withShareExtension.js')) {
  console.log('✅ Share Extension plugin configured in app.json');
} else {
  console.log('❌ Share Extension plugin NOT configured in app.json');
  allPassed = false;
}

console.log('\n📊 Checking database schema version...');

const schemaPath = path.join(__dirname, '..', 'src/database/schema.js');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

if (schemaContent.includes('version: 2')) {
  console.log('✅ Schema version is 2');
} else {
  console.log('❌ Schema version is not 2');
  allPassed = false;
}

if (schemaContent.includes("{ name: 'type'") && schemaContent.includes("{ name: 'media_uri'")) {
  console.log('✅ New fields (type, media_uri) added to schema');
} else {
  console.log('❌ New fields missing from schema');
  allPassed = false;
}

console.log('\n📦 Checking package.json dependencies...');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const requiredDeps = [
  'expo-clipboard',
  'expo-file-system',
  '@react-native-async-storage/async-storage',
];

requiredDeps.forEach((dep) => {
  if (packageJson.dependencies[dep]) {
    console.log(`✅ ${dep}`);
  } else {
    console.log(`❌ ${dep} - NOT INSTALLED`);
    allPassed = false;
  }
});

console.log('\n' + '='.repeat(50));

if (allPassed) {
  console.log('✅ All checks passed!');
  console.log('\n📝 Next steps:');
  console.log('1. Run `npx expo prebuild --clean` to generate native files');
  console.log('2. Build with `eas build --profile development --platform ios`');
  console.log('3. Test Share Extension by sharing text/image from another app');
} else {
  console.log('❌ Some checks failed. Please fix the issues above.');
  process.exit(1);
}
