# Level Format Converter (Old to New)

A batch conversion tool that converts level configurations from the old **StackSort / LaneSort** format to the new **FormatVersion 2** format, with support for batch uploading and 1-click ZIP export.

---

## 🚀 Features

- **Batch Processing**: Convert 1 file, dozens, or hundreds of files all at once.
- **Export to ZIP**: Download all converted `level_{N}.json` files packed neatly in a single `.zip` file.
- **Dual Modes in Web UI** (`index.html`):
  - **📁 Batch Converter**: Drag & drop old JSON files or folders, table view with quick copy buttons, live JSON inspector modal, car variance reroller, and 1-click ZIP export.
  - **👁️ Level Previewer**: Paste any FormatVersion 2 JSON (or old JSON) to visually render the game board with coordinates, column obstacles, car badges, bench slot spotlight, and full car inventory with match-3 balance check.
- **CLI Tools**:
  - **Python CLI** (`convert.py`): Command-line tool for scripting and batch conversions.
  - **Node.js CLI** (`convert.js`): Pure Node.js script using bundled `jszip.min.js` (no `npm install` needed).
- **Car Variance System**: Generates diverse car models (`a`, `b`, `c`) and colors (`1..7`) dynamically for each level while preserving color grouping and Wildcard/Rainbow (`0`).
- **All Game Elements Mapped**:
  - `HiddenColorCar`: Converted with `{ x: col, y: row }`.
  - `LockedColumns`: Converted from `columnFrozenCounts` with `{ index, counter }`.
  - `ColoredColumnsLocation`: Converted from `columnRestrictedColors` with `{ index, carID }`.
  - `WoodenBoxColumns`: Converted from `columnRocked` with `{ index }`.
  - `ConnectedCars`: Converted from `tileConnectionIds` grouped by connection ID `{ connectionID, cars: [{ x, y }] }`.
  - `DoubleLayerCars`: Converted from `tileInnerColors` with `{ x, y, innerCarID }`.
  - `DummyType`: Mapped from `benchStartColor`. Preserves `"0"` for rainbow/wildcard cars.
  - `Map`: 2D comma-separated car grid with top-to-bottom orientation.

---

## 🖥️ Web Interface Guide (`index.html`)

Double-click `start_tool.bat` (or open [`index.html`](file:///c:/Users/TUAN%20ANH/Documents/GitHub/level%20converter/index.html) in your browser). The header provides a tab switcher with two modes:

### Tab 1: 📁 Batch Converter
1. Drag and drop your old `.json` files or click **Select JSON Files** / **Select Folder**.
2. View converted levels in the table, click **📋 Copy** on any row for instant JSON copying, or click **🔍 Inspect** to view details.
3. In the Inspect modal, you can click **👁️ Open in Previewer** to jump directly to the previewer with that level loaded!
4. Click **📦 Export All as ZIP** to download `converted_levels.zip`.

### Tab 2: 👁️ Level Previewer
1. Paste new format level JSON into the text area (or click **📋 Paste from Clipboard**, **📂 Load JSON File**, or choose a preset from the **🎲 Sample** dropdown).
2. The board immediately renders:
   - **🎨 Color Visualization by Code**:
     - `_1`: Red 🔴
     - `_2`: Blue 🔵
     - `_3`: Green 🟢
     - `_4`: Yellow 🟡
     - `_5`: Pink 🌸
     - `_6`: Orange 🟠
     - `_7`: White ⚪
     - `0`: Rainbow Wildcard 🌈
   - **📐 Distinct Car Body Shapes**:
     - `a_`: Sedan 🚗 (Curved aerodynamic roof)
     - `b_`: SUV / Truck 🚙 (Boxy rugged frame with roof rails)
     - `c_`: Sports Car 🏎️ (Sleek aerodynamic wedge racer)
   - **Column Indicators**: `📦 Box` (wooden boxes), `❄️ Lock (N moves)` (locked columns), and `🎯 Only <carID>` (restricted colored roads).
   - **Board Grid**: Cells showing car IDs (`a1`–`c7`, rainbow `0`) with row coordinates (`Y=Max` to `Y=0`).
   - **Element Markers**: `👁️` (hidden car), `🔗 #id` (connected cars), and `🧬 innerCarID` (double layer with matching model shape).
   - **Bench Spotlight**: Starting bench slot car (`DummyType`).
   - **Car Inventory & Modulo-3 Check**: Breakdown of every unique car, outer vs. inner counts, and whether the total forms complete sets of 3 (`✓ Sets of 3` vs. `⚠️ Remainder`).
   - **Obstacles Breakdown**: Detailed list of coordinates and parameters for all special level elements.

---

## 🐍 Method 2: Python CLI

```bash
# Convert a single file or multiple files to a ZIP
python convert.py "c:\Users\TUAN ANH\Downloads\LaneSort_LevelAtlas\levels\StackSortLevel_25.json" -o converted.zip

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
node convert.js "path/to/levels/*.json" -o converted.zip

# Convert a directory
node convert.js "path/to/levels" -o all_levels.zip --dir ./output_json/
```

---

## 📋 Complete Format Mapping Reference

| Element / Field | Old Format | New Format | Implementation Structure |
|---|---|---|---|
| **Version** | — | `FormatVersion: 2` | Constant `2` |
| **Level** | `data.level` / `m_Name` | `MapLevel` | Parsed integer (`level_{N}.json`) |
| **Dimensions** | `columns.length`, `tilesPerColumn` | `NumQueue`, `NumPerRow` | `NumQueue` = column count, `NumPerRow` = tiles per column |
| **Moves** | `data.moves` | `MaxMove` | Exact move limit |
| **Car Variance** | Integers (1, 2, 4, 5, 6...) | Strings (`a1`–`c7`) | Randomized combination of types `a, b, c` and colors `1..7` |
| **Wildcard** | `0` | `"0"` | Preserved as `"0"` |
| **Bench Car** | `benchStartColor` | `DummyType` | Uses mapped car ID; sets `"0"` if `benchStartColor == 0` (preserving rainbow car) |
| **Map Grid** | `columns[].tiles` | `Map` | Array of comma-separated strings (`Map[0]` = top row, `Map[last]` = bottom row) |
| **Hidden Cars** | `columns[].tilesHidden` | `HiddenColorCar` | Array of `{ "x": col, "y": row }` |
| **Locked Columns**| `columnFrozenCounts` | `LockedColumns` | Array of `{ "index": col, "counter": count }` for counts `> 0` |
| **Colored Roads** | `columnRestrictedColors` | `ColoredColumnsLocation` | Array of `{ "index": col, "carID": mapped_car_id }` for entries `!= -1` |
| **Wooden Box** | `columnRocked` | `WoodenBoxColumns` | Array of `{ "index": col }` for rocked columns |
| **Connected Cars**| `columns[].tileConnectionIds` | `ConnectedCars` | Grouped array of `{ "connectionID": id, "cars": [{ "x": col, "y": row }] }` |
| **Double Layer** | `columns[].tileInnerColors` | `DoubleLayerCars` | Array of `{ "x": col, "y": row, "innerCarID": carID }`; inner & outer cars share the same car model (`a` with `a`, `b` with `b`) with distinct colors |
| **unlockFeature** | — | Skipped | Omitted from output config |
| **Extra Columns** | — | `ExtraColumnsCount: 0` | Default 0 |
