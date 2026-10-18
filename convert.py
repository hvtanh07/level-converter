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


def assign_car_colors(unique_colors: List[int], double_layer_pairs: List[Tuple[int, int]], rng: random.Random) -> Dict[int, str]:
    """
    Assign car IDs to unique colors.
    If double layer pairs are present, inner and outer colors are grouped to share the same
    car model (a with a, b with b, c with c) with distinct color numbers (1..7).
    """
    types = ['a', 'b', 'c']
    rng.shuffle(types)

    # Build connected components of double layer pairs
    adj: Dict[int, Set[int]] = {}
    for u, v in double_layer_pairs:
        if u != 0 and v != 0 and u != v:
            adj.setdefault(u, set()).add(v)
            adj.setdefault(v, set()).add(u)

    visited = set()
    components = []
    for node in adj:
        if node not in visited:
            comp = []
            q = [node]
            visited.add(node)
            while q:
                curr = q.pop()
                comp.append(curr)
                for nxt in adj[curr]:
                    if nxt not in visited:
                        visited.add(nxt)
                        q.append(nxt)
            components.append(comp)

    available_by_type = {t: list(range(1, 8)) for t in ['a', 'b', 'c']}
    for t in available_by_type:
        rng.shuffle(available_by_type[t])

    color_map: Dict[int, str] = {0: "0"}
    components.sort(key=len, reverse=True)

    type_idx = 0
    for comp in components:
        if len(comp) <= 7:
            chosen_type = None
            for _ in range(3):
                t = types[type_idx % 3]
                type_idx += 1
                if len(available_by_type[t]) >= len(comp):
                    chosen_type = t
                    break
            if not chosen_type:
                chosen_type = max(available_by_type.keys(), key=lambda t: len(available_by_type[t]))

            for c in comp:
                if c not in color_map and available_by_type[chosen_type]:
                    col_num = available_by_type[chosen_type].pop(0)
                    color_map[c] = f"{chosen_type}{col_num}"
        else:
            for c in comp:
                if c not in color_map:
                    chosen_type = max(available_by_type.keys(), key=lambda t: len(available_by_type[t]))
                    if available_by_type[chosen_type]:
                        col_num = available_by_type[chosen_type].pop(0)
                        color_map[c] = f"{chosen_type}{col_num}"

    # Remaining colors not involved in double layers
    remaining = [c for c in unique_colors if c not in color_map]
    rem_pairs = []
    for t in types:
        for num in available_by_type[t]:
            rem_pairs.append(f"{t}{num}")
    rng.shuffle(rem_pairs)

    for idx, c in enumerate(remaining):
        if idx < len(rem_pairs):
            color_map[c] = rem_pairs[idx]
        else:
            color_map[c] = f"{types[idx % 3]}{(idx % 7) + 1}"

    return color_map


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
    rocked_columns = data.get('columnRocked', [])
    bench_start_color = data.get('benchStartColor', 0)

    # Collect unique colors present on board tiles and inner tiles, and double layer pairs
    unique_colors = []
    double_layer_pairs = []
    for col in columns:
        tiles = col.get('tiles', [])
        inners = col.get('tileInnerColors', [])
        for t in tiles:
            if t != 0 and t not in unique_colors:
                unique_colors.append(t)
        for ic in inners:
            if ic != -1 and ic != 0 and ic not in unique_colors:
                unique_colors.append(ic)
        for t, ic in zip(tiles, inners):
            if ic != -1 and t != 0 and ic != 0:
                double_layer_pairs.append((t, ic))
    
    # Also include bench_start_color if it's non-zero and not in unique_colors
    if bench_start_color != 0 and bench_start_color not in unique_colors:
        unique_colors.append(bench_start_color)

    # Initialize RNG
    rng_seed = seed if seed is not None else level_num
    rng = random.Random(rng_seed)

    # Generate car IDs adhering to double-layer same car type rule
    color_map = assign_car_colors(unique_colors, double_layer_pairs, rng)

    # DummyType: from benchStartColor (preserving '0' if benchStartColor is 0)
    dummy_type = color_map.get(bench_start_color)
    if dummy_type is None:
        dummy_type = color_map.get(unique_colors[0], "a1") if unique_colors else "a1"

    # Map array:
    # Map[0] = top row (tile index tiles_per_column - 1)
    # Map[tiles_per_column - 1] = bottom row (tile index 0)
    map_rows = []
    for r in range(tiles_per_column):
        tile_idx = tiles_per_column - 1 - r
        row_cells = []
        for c in range(num_queue):
            col_tiles = columns[c].get('tiles', [])
            t = col_tiles[tile_idx] if tile_idx < len(col_tiles) else 0
            row_cells.append(color_map.get(t, "0"))
        map_rows.append(",".join(row_cells))

    # Tile-based elements:
    # x = column index (0..num_queue-1)
    # y = tile index from bottom (0 at bottom)
    hidden_cars = []
    double_layer_cars = []
    conn_groups = {}

    for c_idx, col in enumerate(columns):
        tiles = col.get('tiles', [])
        inners = col.get('tileInnerColors', [])
        # Hidden cars
        for r_idx, h in enumerate(col.get('tilesHidden', [])):
            if h == 1:
                hidden_cars.append({"x": c_idx, "y": r_idx})
        # Double layer cars (Rule: inner and outer color must be the same car model: a with a, b with b)
        for r_idx, ic in enumerate(inners):
            if ic != -1:
                outer_t = tiles[r_idx] if r_idx < len(tiles) else 0
                outer_id = color_map.get(outer_t, "a1")
                inner_id = color_map.get(ic, "a1")

                # Guarantee same car type prefix (a with a, b with b, c with c)
                if inner_id[0] != outer_id[0]:
                    col_num = inner_id[1:]
                    if col_num == outer_id[1:]:
                        all_nums = [str(n) for n in range(1, 8) if str(n) != outer_id[1:]]
                        col_num = all_nums[0]
                    inner_id = f"{outer_id[0]}{col_num}"

                double_layer_cars.append({"x": c_idx, "y": r_idx, "innerCarID": inner_id})
        # Connected cars
        for r_idx, cid in enumerate(col.get('tileConnectionIds', [])):
            if cid > 0:
                conn_groups.setdefault(cid, []).append({"x": c_idx, "y": r_idx})

    connected_cars = []
    for cid in sorted(conn_groups.keys()):
        connected_cars.append({
            "connectionID": cid,
            "cars": conn_groups[cid]
        })

    # LockedColumns: maps from columnFrozenCounts where count > 0
    locked_columns = []
    for idx, count in enumerate(frozen_counts):
        if count > 0:
            locked_columns.append({"index": idx, "counter": int(count)})

    # ColoredColumnsLocation: maps from columnRestrictedColors where != -1
    colored_columns = []
    for idx, c in enumerate(restricted_colors):
        if c != -1:
            car_id = color_map.get(c, color_map.get(unique_colors[0], "a1") if unique_colors else "a1")
            colored_columns.append({"index": idx, "carID": car_id})

    # WoodenBoxColumns: maps from columnRocked where rocked == 1
    wooden_box_columns = []
    for idx, rocked in enumerate(rocked_columns):
        if rocked == 1:
            wooden_box_columns.append({"index": idx})

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
        "ColoredColumnsLocation": colored_columns,
        "WoodenBoxColumns": wooden_box_columns,
        "ConnectedCars": connected_cars,
        "DoubleLayerCars": double_layer_cars
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
