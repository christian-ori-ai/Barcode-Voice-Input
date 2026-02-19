# SSCC Barcode Creator

## Overview
A mobile app for creating Code 128 SSCC (Serial Shipping Container Code) barcodes with AI "00" (two leading zeroes). Primary input is voice, secondary is text, with OCR support for scanning SSCC labels from photos.

## Architecture
- **Frontend**: Expo (React Native) with expo-router, running on port 8081
- **Backend**: Express server on port 5000, handles OCR via OpenAI vision API
- **State**: AsyncStorage for local barcode history persistence
- **Barcode Engine**: Pure JS Code 128 encoder in `lib/code128.ts`

## Key Files
- `app/index.tsx` - Main screen with voice/camera/text input and barcode display
- `lib/code128.ts` - Code 128 barcode encoding with GS1-128 SSCC support
- `components/BarcodeView.tsx` - SVG barcode renderer using react-native-svg
- `server/ocr.ts` - OpenAI vision OCR for extracting SSCCs from images
- `server/routes.ts` - API routes (/api/ocr)
- `constants/colors.ts` - Dark navy + teal theme palette

## Features
- Voice input (Web Speech API on web, keyboard dictation on native)
- Camera photo OCR (take photo, AI extracts SSCC numbers)
- Gallery OCR (pick existing image)
- Text input with (00) prefix and digit counter
- Auto check digit calculation (enter 17 digits, check digit auto-added)
- Check digit validation (enter 18 digits, validates)
- Barcode history with tap-to-regenerate
- Copy SSCC to clipboard

## Recent Changes
- 2026-02-19: Initial build with voice, text, camera OCR, barcode generation, history
- OpenAI AI Integration added for OCR (gpt-5-nano vision)

## User Preferences
- None recorded yet
