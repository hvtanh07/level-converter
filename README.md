# Level Format Converter (Old to New)

A batch conversion tool that converts level configurations from the old **StackSort / LaneSort** format to the new **FormatVersion 2** format, with support for batch uploading and 1-click ZIP export.

---

## 🚀 Features

- **Batch Processing**: Convert 1 file, dozens, or hundreds of files all at once.
- **Export to ZIP**: Download all converted `level_{N}.json` files packed neatly in a single `.zip` file.
- **Dual Interfaces**:
  - **Interactive Web UI** (`index.html`): Drag & drop interface, visual board preview, live JSON inspector, car variance reroller, and 1-click ZIP download. Zero installation required.
  - **Python CLI** (`convert.py`): Command-line tool for scripting and batch conversions.
  - **Node.js CLI** (`convert.js`): Pure Node.js script using bundled `jszip.min.js` (no `npm install` needed).
- **Car Variance System**: Generates diverse car models (`a`, `b`, `c`) and colors (`1..7`) dynamically for each level while preserving color grouping and Wildcard/Rainbow (`0`).
- **Game Features Mapped**:
  - `HiddenColorCar`: Converted with `{ x: column, y: bottom_up_index }`.
  - `LockedColumns`: Converted from `columnFrozenCounts` with `{ index, counter }`.
  - `ColoredColumnsLocation`: Converted from `columnRestrictedColors` with `{ index, carID }`.
  - `DummyType`: Mapped from `benchStartColor`.
  - `Map`: 2D comma-separated car grid with top-to-bottom orientation.

---

## 🖥️ Method 1: Web Interface (Recommended)

1. Double-click `start_tool.bat` (or open `index.html` in your browser).
2. Drag and drop your old `.json` files or click **Select JSON Files** / **Select Folder**.
3. View the converted levels in the table, inspect visual board layouts, or reroll car variants with the **🎲 Reroll Car Variance** button.
4. Click **📦 Export All as ZIP** to download `converted_levels.zip`.

---

## 🐍 Method 2: Python CLI

```bash
# Convert a single file to a zip
python convert.py "c:\Users\TUAN ANH\Downloads\oldconfig.json" -o converted.zip

# Convert multiple files or an entire folder
python convert.py "path/to/levels/*.json" -o all_levels.zip

# Also output individual JSON files into a directory
python convert.py "path/to/levels/*.json" -o all_levels.zip --dir ./output_json/

# Reproducible custom random seed
python convert.py "path/to/levels/*.json" -o all_levels.zip --seed 42
```

---

## 🟢 Method 3: Node.js CLI

```bash
# Convert a single file or wildcards
node convert.js "c:\Users\TUAN ANH\Downloads\oldconfig.json" -o converted.zip

# Convert a directory
node convert.js "path/to/levels" -o all_levels.zip --dir ./output_json/
```

---

## 📋 Format Mapping Summary

| Field | Old Format | New Format | Mapping Logic |
|---|---|---|---|
| **Version** | N/A | `FormatVersion: 2` | Constant |
| **Level** | `data.level` / `m_Name` | `MapLevel` | Parsed integer |
| **Grid Width** | `columns.length` | `NumQueue` | Total number of columns |
| **Grid Height** | `tilesPerColumn` | `NumPerRow` | Tiles per column |
| **Moves** | `data.moves` | `MaxMove` | Exact move limit |
| **Tiles Map** | `columns[].tiles` | `Map` | Array of strings from top row down to bottom row |
| **Tile IDs** | Integer (1, 2, 4...) | String (`a1`, `b2`, `c3`...) | Randomized combination of types `a, b, c` and colors `1..7` |
| **Wildcard** | `0` | `"0"` | Preserved |
| **Hidden Tiles** | `columns[].tilesHidden` | `HiddenColorCar` | Array of `{ x: col, y: bottom_up_tile_idx }` |
| **Frozen Cols** | `columnFrozenCounts` | `LockedColumns` | Array of `{ index: col, counter: count }` |
| **Color Roads** | `columnRestrictedColors` | `ColoredColumnsLocation` | Array of `{ index: col, carID: mapped_id }` |
| **Bench** | `benchStartColor` | `DummyType` | Mapped car ID matching bench color |
| **Extra Cols** | N/A | `ExtraColumnsCount: 0` | Default 0 |
