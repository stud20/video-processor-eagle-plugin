# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Video Processor Eagle Plugin** that automatically detects scene changes in videos and extracts frames/clips. It's built as a desktop plugin for Eagle (asset management app) using vanilla JavaScript and FFmpeg for video processing.

**Key Features:**
- Automatic cut detection using FFmpeg scene analysis
- Frame extraction from detected scenes
- Clip extraction for each scene
- Batch processing support
- Eagle library integration via Watch Folder

## Common Commands

```bash
# Install dependencies
npm install

# Development mode (reminder only - plugin runs directly in Eagle)
npm run dev

# Build verification
npm run build

# Testing reminder
npm run test

# Testing the plugin
# Open test-*.html files in browser for module testing
# Use small video files for testing in Eagle environment
```

## Development Setup

**Installation Path:**
- macOS: `~/Library/Application Support/Eagle/plugins/`
- Windows: `%APPDATA%/Eagle/plugins/`

**Requirements:**
- Eagle 4.0+
- Node.js 16.0+
- FFmpeg (auto-installed by plugin)

**Testing:**
- Use browser-based testing with `test-*.html` files
- Test with small video files in Eagle environment
- Check console for module loading and dependency verification

## Architecture Overview

**Plugin Structure (After Refactoring):**
```
src/
├── main.js           # Legacy main controller (kept for compatibility)
├── main-refactored.js # New modular main controller
├── main.html         # UI layout (320x600px resizable window)
├── styles.css        # Modern CSS with gradients and transitions
├── core/             # Core system modules
│   ├── state-manager.js      # Centralized state management
│   ├── error-handler.js      # Unified error handling system
│   ├── progress-manager.js   # Progress tracking and management
│   └── watchdog.js          # Plugin health monitoring
├── ui/               # User interface modules
│   └── ui-controller.js     # UI updates and user feedback
├── modules/          # Processing modules
│   ├── video-analyzer.js     # FFmpeg-based cut detection engine
│   ├── frame-extractor.js    # Frame extraction module
│   ├── clip-extractor.js     # Clip extraction module
│   ├── video-concatenator.js # Multi-video merging module
│   ├── eagle-importer.js     # Eagle library integration
│   ├── smart-frame-selector.js # AI-based frame selection
│   └── common/
│       ├── eagle-utils.js    # Eagle API utilities
│       └── config-manager.js # Centralized configuration
└── integration/      # Eagle integration modules
```

**Key Systems (Refactored):**
- **StateManager**: Centralized state management with change notifications
- **UIController**: UI updates and user feedback management
- **ErrorHandler**: Unified error handling with user-friendly messages
- **ProgressManager**: Advanced progress tracking with stage management
- **PluginWatchdog**: Health monitoring with modular dependencies
- **Modular Architecture**: Clear separation of concerns with dependency injection

## Processing Pipeline

1. **Input**: Video files selected from Eagle library
2. **Analysis**: FFmpeg scene detection with configurable sensitivity (0.1-0.7)
3. **Extraction**: 
   - Frame extraction: Middle frame of each detected scene
   - Clip extraction: Individual video clips for each scene
4. **Output**: Files saved to `/Users/ysk/assets/temp/clips/` and `/Users/ysk/assets/temp/frame/`
5. **Integration**: Automatic import to Eagle library via Watch Folder

## Performance Features

- **Phase 2 Optimization**: High-speed parallel processing for 10+ cuts
- **Multi-core Support**: Automatic CPU core detection and utilization
- **Batch Processing**: Process multiple videos simultaneously
- **Stream Copy**: Avoids re-encoding when possible for speed

## Configuration

**Key Settings (ConfigManager):**
- Cut detection sensitivity (0.1-0.7)
- Output formats (JPG/PNG for frames, MP4 for clips)
- Quality settings (1-10)
- In/Out handles for frame adjustment
- Processing modes (high-speed parallel vs stable parallel)

## File Naming Convention

- Clips: `{originalName}_clip_{number}.mp4`
- Frames: `{originalName}_frame_{number}.{extension}`

## Eagle Integration

- Uses Eagle Plugin API 4.0+
- Requires permissions: file:read, file:write, library:read, library:write
- Auto-imports processed files using Watch Folder functionality
- Supports keyboard shortcuts: Cmd/Ctrl + Shift + V/F for quick processing

## Development Notes

- Plugin runs in Eagle's environment, not standalone
- Uses ES6+ JavaScript with class-based architecture
- FFmpeg dependency is auto-managed by Eagle plugin system
- UI is designed for 320x600px window with responsive resizing
- All text and comments are in Korean as this is a Korean-developed plugin

## Refactoring Information

The codebase has been refactored to improve maintainability and structure:

**Before Refactoring:**
- Single monolithic main.js file (2,288 lines)
- Mixed concerns in single file
- Global state management
- Inconsistent error handling

**After Refactoring:**
- Modular architecture with clear separation of concerns
- Centralized state management with StateManager
- Unified error handling with ErrorHandler
- Advanced progress tracking with ProgressManager
- UI logic separated into UIController
- Plugin health monitoring with PluginWatchdog

**Benefits:**
- Better maintainability and readability
- Easier testing and debugging
- Clear module boundaries
- Consistent error handling
- Improved code organization

**Testing:**
- Use `test-refactored-modules.html` to test individual modules
- Both old and new systems work together for compatibility
- New modules are designed to be testable in isolation

## Development Status & Future Tasks

### ✅ Completed Features
- **Core Video Processing**: Cut detection, frame/clip extraction
- **Modular Architecture**: Refactored from monolithic to modular design
- **Smart Frame Selection**: AI-based clustering for diverse frame selection
- **Worker Pool Optimization**: M4 MAX optimized parallel processing
- **Eagle Integration**: Automatic import with proper folder structure
- **Error Handling**: Unified error system with user-friendly messages
- **Progress Management**: Advanced progress tracking with stage management
- **File Organization**: Video-named subfolders for clips and frames
- **Re-encoding Only**: Removed stream copy for accurate timing and file sizes
- **Video Concatenation**: Multi-video merging with format compatibility detection

### 🔄 Future Development Tasks

#### High Priority
1. **Performance Optimization**
   - GPU acceleration for video analysis
   - Better memory management for large video files
   - Streaming processing for very long videos

2. **Advanced Smart Features**
   - Face detection integration for portrait frame selection
   - Motion detection for action scene identification
   - Audio analysis for music/speech scene detection

3. **User Experience Improvements**
   - Real-time preview of detected cuts
   - Drag-and-drop file selection
   - Custom output folder selection
   - Batch processing queue management

#### Medium Priority
4. **Format Support**
   - Additional video formats (AVI, MKV, etc.)
   - HDR video processing support
   - 4K/8K video optimization

5. **Export Features**
   - Export settings presets
   - Custom naming templates
   - Metadata preservation

6. **Integration Enhancements**
   - Adobe Premiere Pro integration
   - Final Cut Pro XML export
   - Direct YouTube upload

#### Low Priority
7. **Advanced Analysis**
   - Scene classification (indoor/outdoor, day/night)
   - Color palette analysis
   - Automatic thumbnail generation

8. **Collaboration Features**
   - Cloud sync for settings
   - Sharing extracted assets
   - Team collaboration tools

### 🐛 Known Issues
- Configuration path warnings in console (non-blocking)
- Large video memory usage during processing
- Occasional FFmpeg timeout on complex scenes

### 📊 Performance Metrics
- M4 MAX: 12-core parallel processing
- Average processing speed: 2-3x real-time
- Memory usage: ~500MB per concurrent video
- Supported file sizes: Up to 10GB per video