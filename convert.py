"""
Level Converter: Converts old StackSort / LaneSort level JSONs to the new format.
Usage:
    python convert.py <input_files_or_dir> [-o output.zip] [--dir output_dir] [--seed 42]
"""

import os
import sys
import glob
import json
import random
import zipfile
import argparse
from typing import Dict, Any, List, Tuple


def get_balanced_car_ids(count: int, rng: random.Random) -> List[str]:
    """
    Generate `count` distinct car IDs with balanced distribution across
    types ('a', 'b', 'c') and colors (1..7).
    """
    types = ['a', 'b', 'c']
    all_pairs = [(t, c) for t in types for c in range(1, 8)]  # 21 unique combinations
    
    # Shuffle all pairs with the provided RNG
    rng.shuffle(all_pairs)
    
    if count <= len(all_pairs):
        return [f"{t}{c}" for t, c in all_pairs[:count]]
    
    # If more than 21 colors (very rare), cycle through with reshuffle
    result = [f"{t}{c}" for t, c in all_pairs]
    while len(result) < count:
        rng.shuffle(all_pairs)
        for t, c in all_pairs:
            result.append(f"{t}{c}")
            if len(result) == count:
                break
    return result


def convert_level(old_data: Dict[str, Any], seed: int = None) -> Tuple[Dict[str, Any], int]:
    """
    Converts a single old-format level dictionary to the new format.
    Returns (new_config_dict, level_number).
    """
    data = old_data.get('data', old_data)
    
    # Determine level number
    level_num = data.get('level')
    if level_num is None:
        name = old_data.get('m_Name', '')
        # Try extracting trailing number from name like StackSortLevel_49
        import re
        m = re.search(r'\d+', name)
        level_num = int(m.group(0)) if m else 1
    else:
        level_num = int(level_num)

    columns = data.get('columns', [])
    num_queue = len(columns)
    
    # Tiles per column (height of each column)
    tiles_per_column = data.get('tilesPerColumn')
    if not tiles_per_column:
        tiles_per_column = len(columns[0].get('tiles', [])) if columns else 0
    tiles_per_column = int(tiles_per_column)

    moves = int(data.get('moves', 0))
    frozen_counts = data.get('columnFrozenCounts', [])
    restricted_colors = data.get('columnRestrictedColors', [])
    bench_start_color = data.get('benchStartColor', 0)

    # Collect unique colors present on board tiles (excluding 0 which is wildcard/empty)
    unique_colors = []
    for col in columns:
        for t in col.get('tiles', []):
            if t != 0 and t not in unique_colors:
                unique_colors.append(t)
    
    # Also include bench_start_color if it's non-zero and not in unique_colors
    if bench_start_color != 0 and bench_start_color not in unique_colors:
        unique_colors.append(bench_start_color)

    # Initialize RNG
    rng_seed = seed if seed is not None else level_num
    rng = random.Random(rng_seed)

    # Generate car IDs for each unique color
    assigned_ids = get_balanced_car_ids(len(unique_colors), rng)
    color_map: Dict[int, str] = {0: "0"}
    for idx, c in enumerate(unique_colors):
        color_map[c] = assigned_ids[idx]

    # DummyType: from benchStartColor, or first mapped car if benchStartColor is 0 / unmapped
    dummy_type = color_map.get(bench_start_color)
    if not dummy_type or dummy_type == "0":
        dummy_type = assigned_ids[0] if assigned_ids else "a1"

    # Map array:
    # Map[0] = top row (tile index tiles_per_column - 1)
    # Map[tiles_per_column - 1] = bottom row (tile index 0)
    # Comma-separated car IDs across columns (x: 0 .. num_queue - 1)
    map_rows = []
    for r in range(tiles_per_column):
        tile_idx = tiles_per_column - 1 - r
        row_cells = []
        for c in range(num_queue):
            col_tiles = columns[c].get('tiles', [])
            t = col_tiles[tile_idx] if tile_idx < len(col_tiles) else 0
            row_cells.append(color_map.get(t, "0"))
        map_rows.append(",".join(row_cells))

    # HiddenColorCar:
    # x = column index (0..num_queue-1)
    # y = tile index from bottom (0 at bottom)
    hidden_cars = []
    for c_idx, col in enumerate(columns):
        th = col.get('tilesHidden', [])
        for r_idx, h in enumerate(th):
            if h == 1:
                hidden_cars.append({"x": c_idx, "y": r_idx})

    # LockedColumns: maps from columnFrozenCounts where count > 0
    locked_columns = []
    for idx, count in enumerate(frozen_counts):
        if count > 0:
            locked_columns.append({"index": idx, "counter": int(count)})

    # ColoredColumnsLocation: maps from columnRestrictedColors where != -1
    colored_columns = []
    for idx, c in enumerate(restricted_colors):
        if c != -1:
            car_id = color_map.get(c, assigned_ids[0] if assigned_ids else "a1")
            colored_columns.append({"index": idx, "carID": car_id})

    new_config = {
        "FormatVersion": 2,
        "MapLevel": level_num,
        "NumQueue": num_queue,
        "NumPerRow": tiles_per_column,
        "ExtraColumnsCount": 0,
        "MaxMove": moves,
        "Map": map_rows,
        "DummyType": dummy_type,
        "HiddenColorCar": hidden_cars,
        "LockedColumns": locked_columns,
        "ColoredColumnsLocation": colored_columns
    }

    return new_config, level_num


def collect_input_files(inputs: List[str]) -> List[str]:
    """Resolve file paths, directories, and glob patterns."""
    files = []
    for item in inputs:
        if os.path.isdir(item):
            for root, _, filenames in os.walk(item):
                for f in filenames:
                    if f.lower().endswith('.json'):
                        files.append(os.path.join(root, f))
        elif any(char in item for char in ['*', '?']):
            matched = glob.glob(item, recursive=True)
            files.extend([m for m in matched if os.path.isfile(m) and m.lower().endswith('.json')])
        elif os.path.isfile(item):
            files.append(item)
    # Deduplicate while preserving order
    seen = set()
    result = []
    for f in files:
        norm = os.path.abspath(f)
        if norm not in seen:
            seen.add(norm)
            result.append(norm)
    return result


def main():
    parser = argparse.ArgumentParser(description="Convert old level JSONs to the new format and package as ZIP.")
    parser.add_argument("inputs", nargs="+", help="Input JSON files, directories, or glob patterns.")
    parser.add_argument("-o", "--output-zip", help="Path to export ZIP file (e.g. converted_levels.zip).", default="converted_levels.zip")
    parser.add_argument("--dir", help="Optional directory to also save individual converted JSON files.")
    parser.add_argument("--seed", type=int, default=None, help="Optional master seed for random car variance (default: level-based).")
    
    args = parser.parse_args()
    files = collect_input_files(args.inputs)

    if not files:
        print("Error: No JSON files found from the provided inputs.")
        sys.exit(1)

    print(f"Found {len(files)} file(s) to convert.")
    
    if args.dir:
        os.makedirs(args.dir, exist_ok=True)

    converted_files = []
    errors = []

    for file_path in files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = json.load(f)
            
            new_config, level_num = convert_level(content, seed=args.seed)
            out_filename = f"level_{level_num}.json"
            json_str = json.dumps(new_config, indent=4)

            converted_files.append((out_filename, json_str, level_num))

            if args.dir:
                out_path = os.path.join(args.dir, out_filename)
                with open(out_path, "w", encoding="utf-8") as f:
                    f.write(json_str)
            
            print(f"  [OK] {os.path.basename(file_path)} -> {out_filename} (Level {level_num}, {new_config['NumQueue']}x{new_config['NumPerRow']})")
        except Exception as e:
            errors.append((file_path, str(e)))
            print(f"  [ERROR] {os.path.basename(file_path)}: {e}")

    # Write ZIP file
    if args.output_zip and converted_files:
        zip_path = os.path.abspath(args.output_zip)
        zip_dir = os.path.dirname(zip_path)
        if zip_dir:
            os.makedirs(zip_dir, exist_ok=True)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for out_filename, json_str, _ in converted_files:
                zf.writestr(out_filename, json_str)
        print(f"\nSuccessfully created ZIP: {zip_path} with {len(converted_files)} level(s).")

    if errors:
        print(f"\nCompleted with {len(errors)} error(s).")
    else:
        print(f"\nAll {len(converted_files)} level(s) converted successfully!")


if __name__ == "__main__":
    main()
