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

function assignCarColors(uniqueColors, doubleLayerPairs, rng) {
    const types = ['a', 'b', 'c'];
    // Shuffle types
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
    }

    // Build connected components of double layer pairs
    const adj = {};
    doubleLayerPairs.forEach(([u, v]) => {
        if (u !== 0 && v !== 0 && u !== v) {
            if (!adj[u]) adj[u] = new Set();
            if (!adj[v]) adj[v] = new Set();
            adj[u].add(v);
            adj[v].add(u);
        }
    });

    const visited = new Set();
    const components = [];
    Object.keys(adj).map(Number).forEach(node => {
        if (!visited.has(node)) {
            const comp = [];
            const q = [node];
            visited.add(node);
            while (q.length > 0) {
                const curr = q.pop();
                comp.push(curr);
                (adj[curr] || []).forEach(nxt => {
                    if (!visited.has(nxt)) {
                        visited.add(nxt);
                        q.push(nxt);
                    }
                });
            }
            components.push(comp);
        }
    });

    const availableByType = {
        a: [1, 2, 3, 4, 5, 6, 7],
        b: [1, 2, 3, 4, 5, 6, 7],
        c: [1, 2, 3, 4, 5, 6, 7]
    };
    ['a', 'b', 'c'].forEach(t => {
        for (let i = availableByType[t].length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [availableByType[t][i], availableByType[t][j]] = [availableByType[t][j], availableByType[t][i]];
        }
    });

    const colorMap = { 0: "0" };
    components.sort((a, b) => b.length - a.length);

    let typeIdx = 0;
    components.forEach(comp => {
        if (comp.length <= 7) {
            let chosenType = null;
            for (let i = 0; i < 3; i++) {
                const t = types[typeIdx % 3];
                typeIdx++;
                if (availableByType[t].length >= comp.length) {
                    chosenType = t;
                    break;
                }
            }
            if (!chosenType) {
                chosenType = Object.keys(availableByType).reduce((a, b) => 
                    availableByType[a].length > availableByType[b].length ? a : b
                );
            }

            comp.forEach(c => {
                if (colorMap[c] === undefined && availableByType[chosenType].length > 0) {
                    const colNum = availableByType[chosenType].shift();
                    colorMap[c] = `${chosenType}${colNum}`;
                }
            });
        } else {
            comp.forEach(c => {
                if (colorMap[c] === undefined) {
                    const chosenType = Object.keys(availableByType).reduce((a, b) => 
                        availableByType[a].length > availableByType[b].length ? a : b
                    );
                    if (availableByType[chosenType].length > 0) {
                        const colNum = availableByType[chosenType].shift();
                        colorMap[c] = `${chosenType}${colNum}`;
                    }
                }
            });
        }
    });

    const remaining = uniqueColors.filter(c => colorMap[c] === undefined);
    const remPairs = [];
    types.forEach(t => {
        availableByType[t].forEach(num => {
            remPairs.push(`${t}${num}`);
        });
    });
    for (let i = remPairs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [remPairs[i], remPairs[j]] = [remPairs[j], remPairs[i]];
    }

    remaining.forEach((c, idx) => {
        if (idx < remPairs.length) {
            colorMap[c] = remPairs[idx];
        } else {
            colorMap[c] = `${types[idx % 3]}${(idx % 7) + 1}`;
        }
    });

    return colorMap;
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

    // Collect unique colors and double layer pairs
    const uniqueColors = [];
    const doubleLayerPairs = [];
    for (const col of columns) {
        const tiles = col.tiles || [];
        const inners = col.tileInnerColors || [];
        for (const t of tiles) {
            if (t !== 0 && !uniqueColors.includes(t)) {
                uniqueColors.push(t);
            }
        }
        for (const ic of inners) {
            if (ic !== -1 && ic !== 0 && !uniqueColors.includes(ic)) {
                uniqueColors.push(ic);
            }
        }
        for (let i = 0; i < inners.length; i++) {
            const ic = inners[i];
            const t = i < tiles.length ? tiles[i] : 0;
            if (ic !== -1 && t !== 0 && ic !== 0) {
                doubleLayerPairs.push([t, ic]);
            }
        }
    }
    if (benchStartColor !== 0 && !uniqueColors.includes(benchStartColor)) {
        uniqueColors.push(benchStartColor);
    }

    const rngSeed = seed !== null ? seed : levelNum;
    const rng = createRng(rngSeed);

    const colorMap = assignCarColors(uniqueColors, doubleLayerPairs, rng);

    let dummyType = colorMap[benchStartColor];
    if (dummyType === undefined) {
        dummyType = colorMap[uniqueColors[0]] || "a1";
    }

    // Map rows:
    // First row of config (Map[0]) is first column (c = 0) from left to right ingame
    // First car on a row in config is the bottom car in game (r = 0 .. tilesPerColumn - 1)
    const mapRows = [];
    for (let c = 0; c < numQueue; c++) {
        const colTiles = columns[c] && columns[c].tiles ? columns[c].tiles : [];
        const colCars = [];
        for (let r = 0; r < tilesPerColumn; r++) {
            const t = r < colTiles.length ? colTiles[r] : 0;
            colCars.push(colorMap[t] || "0");
        }
        mapRows.push(colCars.join(","));
    }

    // Tile-based elements
    const hiddenCars = [];
    const doubleLayerCars = [];
    const connGroups = {};

    columns.forEach((col, cIdx) => {
        const tiles = col.tiles || [];
        const inners = col.tileInnerColors || [];
        // Hidden
        (col.tilesHidden || []).forEach((h, rIdx) => {
            if (h === 1) {
                hiddenCars.push({ x: cIdx, y: rIdx });
            }
        });
        // Double layer: enforce same car model: a with a, b with b
        inners.forEach((ic, rIdx) => {
            if (ic !== -1) {
                const outerTile = rIdx < tiles.length ? tiles[rIdx] : 0;
                const outerId = colorMap[outerTile] || "a1";
                let innerId = colorMap[ic] || "a1";

                if (innerId[0] !== outerId[0]) {
                    let colNum = innerId.slice(1);
                    if (colNum === outerId.slice(1)) {
                        const allNums = [1, 2, 3, 4, 5, 6, 7].map(String).filter(n => n !== outerId.slice(1));
                        colNum = allNums[0];
                    }
                    innerId = `${outerId[0]}${colNum}`;
                }

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
            const carId = colorMap[c] || (uniqueColors.length > 0 ? colorMap[uniqueColors[0]] : "a1");
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
    module.exports = { convertLevel, assignCarColors };
}

if (require.main === module) {
    main();
}
