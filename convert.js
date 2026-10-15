/**
 * Level Converter: Converts old StackSort / LaneSort level JSONs to the new format.
 * Works natively in Node.js using bundled jszip.min.js (no npm install required).
 * 
 * Usage:
 *   node convert.js <input_files_or_dir> [-o output.zip] [--dir output_folder] [--seed 42]
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('./jszip.min.js');

function createRng(seed) {
    let s = Math.abs(seed) || 123456789;
    return function() {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}

function getBalancedCarIds(count, rng) {
    const types = ['a', 'b', 'c'];
    const allPairs = [];
    for (const t of types) {
        for (let c = 1; c <= 7; c++) {
            allPairs.push(`${t}${c}`);
        }
    }

    // Shuffle pairs
    for (let i = allPairs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
    }

    if (count <= allPairs.length) {
        return allPairs.slice(0, count);
    }

    const result = [...allPairs];
    while (result.length < count) {
        for (let i = allPairs.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
        }
        for (const id of allPairs) {
            result.push(id);
            if (result.length === count) break;
        }
    }
    return result;
}

function convertLevel(oldData, seed = null) {
    const data = oldData.data || oldData;

    let levelNum = data.level;
    if (levelNum === undefined || levelNum === null) {
        const name = oldData.m_Name || '';
        const match = name.match(/\d+/);
        levelNum = match ? parseInt(match[0], 10) : 1;
    } else {
        levelNum = parseInt(levelNum, 10);
    }

    const columns = data.columns || [];
    const numQueue = columns.length;

    let tilesPerColumn = data.tilesPerColumn;
    if (!tilesPerColumn) {
        tilesPerColumn = columns.length && columns[0].tiles ? columns[0].tiles.length : 0;
    }
    tilesPerColumn = parseInt(tilesPerColumn, 10);

    const moves = parseInt(data.moves || 0, 10);
    const frozenCounts = data.columnFrozenCounts || [];
    const restrictedColors = data.columnRestrictedColors || [];
    const rockedColumns = data.columnRocked || [];
    const benchStartColor = data.benchStartColor !== undefined ? data.benchStartColor : 0;

    // Collect unique colors excluding 0, including inner layer colors
    const uniqueColors = [];
    for (const col of columns) {
        for (const t of (col.tiles || [])) {
            if (t !== 0 && !uniqueColors.includes(t)) {
                uniqueColors.push(t);
            }
        }
        for (const ic of (col.tileInnerColors || [])) {
            if (ic !== -1 && ic !== 0 && !uniqueColors.includes(ic)) {
                uniqueColors.push(ic);
            }
        }
    }
    if (benchStartColor !== 0 && !uniqueColors.includes(benchStartColor)) {
        uniqueColors.push(benchStartColor);
    }

    const rngSeed = seed !== null ? seed : levelNum;
    const rng = createRng(rngSeed);

    const assignedIds = getBalancedCarIds(uniqueColors.length, rng);
    const colorMap = { 0: "0" };
    uniqueColors.forEach((c, idx) => {
        colorMap[c] = assignedIds[idx];
    });

    let dummyType = colorMap[benchStartColor];
    if (dummyType === undefined) {
        dummyType = assignedIds.length > 0 ? assignedIds[0] : "a1";
    }

    // Map rows (Map[0] = top row, Map[last] = bottom row)
    const mapRows = [];
    for (let r = 0; r < tilesPerColumn; r++) {
        const tileIdx = tilesPerColumn - 1 - r;
        const rowCells = [];
        for (let c = 0; c < numQueue; c++) {
            const colTiles = columns[c] && columns[c].tiles ? columns[c].tiles : [];
            const t = tileIdx < colTiles.length ? colTiles[tileIdx] : 0;
            rowCells.push(colorMap[t] || "0");
        }
        mapRows.push(rowCells.join(","));
    }

    // Tile-based elements
    const hiddenCars = [];
    const doubleLayerCars = [];
    const connGroups = {};

    columns.forEach((col, cIdx) => {
        // Hidden
        (col.tilesHidden || []).forEach((h, rIdx) => {
            if (h === 1) {
                hiddenCars.push({ x: cIdx, y: rIdx });
            }
        });
        // Double layer
        (col.tileInnerColors || []).forEach((ic, rIdx) => {
            if (ic !== -1) {
                const innerId = colorMap[ic] || (assignedIds.length > 0 ? assignedIds[0] : "a1");
                doubleLayerCars.push({ x: cIdx, y: rIdx, innerCarID: innerId });
            }
        });
        // Connected cars
        (col.tileConnectionIds || []).forEach((cid, rIdx) => {
            if (cid > 0) {
                if (!connGroups[cid]) connGroups[cid] = [];
                connGroups[cid].push({ x: cIdx, y: rIdx });
            }
        });
    });

    const connectedCars = [];
    Object.keys(connGroups).map(Number).sort((a, b) => a - b).forEach(cid => {
        connectedCars.push({
            connectionID: cid,
            cars: connGroups[cid]
        });
    });

    // LockedColumns
    const lockedColumns = [];
    frozenCounts.forEach((count, idx) => {
        if (count > 0) {
            lockedColumns.push({ index: idx, counter: parseInt(count, 10) });
        }
    });

    // ColoredColumnsLocation
    const coloredColumns = [];
    restrictedColors.forEach((c, idx) => {
        if (c !== -1) {
            const carId = colorMap[c] || (assignedIds.length > 0 ? assignedIds[0] : "a1");
            coloredColumns.push({ index: idx, carID: carId });
        }
    });

    // WoodenBoxColumns
    const woodenBoxColumns = [];
    rockedColumns.forEach((rocked, idx) => {
        if (rocked === 1) {
            woodenBoxColumns.push({ index: idx });
        }
    });

    const newConfig = {
        FormatVersion: 2,
        MapLevel: levelNum,
        NumQueue: numQueue,
        NumPerRow: tilesPerColumn,
        ExtraColumnsCount: 0,
        MaxMove: moves,
        Map: mapRows,
        DummyType: dummyType,
        HiddenColorCar: hiddenCars,
        LockedColumns: lockedColumns,
        ColoredColumnsLocation: coloredColumns,
        WoodenBoxColumns: woodenBoxColumns,
        ConnectedCars: connectedCars,
        DoubleLayerCars: doubleLayerCars
    };

    return { newConfig, levelNum, colorMap };
}

function collectFiles(inputs) {
    const files = [];
    for (const item of inputs) {
        if (!fs.existsSync(item)) continue;
        const stat = fs.statSync(item);
        if (stat.isDirectory()) {
            const walk = (dir) => {
                const list = fs.readdirSync(dir);
                for (const f of list) {
                    const full = path.join(dir, f);
                    if (fs.statSync(full).isDirectory()) {
                        walk(full);
                    } else if (f.toLowerCase().endsWith('.json')) {
                        files.push(full);
                    }
                }
            };
            walk(item);
        } else if (stat.isFile() && item.toLowerCase().endsWith('.json')) {
            files.push(path.resolve(item));
        }
    }
    return Array.from(new Set(files));
}

async function main() {
    const args = process.argv.slice(2);
    let outputZip = "converted_levels.zip";
    let outputDir = null;
    let seed = null;
    const inputs = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "-o" || args[i] === "--output-zip") {
            outputZip = args[++i];
        } else if (args[i] === "--dir") {
            outputDir = args[++i];
        } else if (args[i] === "--seed") {
            seed = parseInt(args[++i], 10);
        } else {
            inputs.push(args[i]);
        }
    }

    if (inputs.length === 0) {
        console.log("Usage: node convert.js <input_files_or_dir> [-o output.zip] [--dir output_folder] [--seed 42]");
        process.exit(1);
    }

    const files = collectFiles(inputs);
    if (files.length === 0) {
        console.error("Error: No JSON files found from the specified inputs.");
        process.exit(1);
    }

    console.log(`Found ${files.length} file(s) to convert.`);
    if (outputDir) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const zip = new JSZip();
    let convertedCount = 0;
    let errorCount = 0;

    for (const filePath of files) {
        try {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const { newConfig, levelNum } = convertLevel(content, seed);
            const outName = `level_${levelNum}.json`;
            const jsonStr = JSON.stringify(newConfig, null, 4);

            zip.file(outName, jsonStr);

            if (outputDir) {
                fs.writeFileSync(path.join(outputDir, outName), jsonStr, 'utf-8');
            }

            console.log(`  [OK] ${path.basename(filePath)} -> ${outName} (Level ${levelNum}, ${newConfig.NumQueue}x${newConfig.NumPerRow})`);
            convertedCount++;
        } catch (e) {
            console.error(`  [ERROR] ${path.basename(filePath)}: ${e.message}`);
            errorCount++;
        }
    }

    if (outputZip && convertedCount > 0) {
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        const absZip = path.resolve(outputZip);
        fs.mkdirSync(path.dirname(absZip), { recursive: true });
        fs.writeFileSync(absZip, zipBuffer);
        console.log(`\nSuccessfully created ZIP: ${absZip} with ${convertedCount} level(s).`);
    }

    if (errorCount > 0) {
        console.log(`\nCompleted with ${errorCount} error(s).`);
    } else {
        console.log(`\nAll ${convertedCount} level(s) converted successfully!`);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { convertLevel, getBalancedCarIds };
}

if (require.main === module) {
    main();
}
