import { instance } from '@viz-js/viz';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateGraphImage() {
  console.log('Generating graph image using @viz-js/viz...');

  // Define a simple graph in DOT language
  const dotGraph = `
    digraph SimpleGraph {
      rankdir=LR; // Left to right layout
      node [shape=box, style=rounded]; // Node shape
      A [label="Start Node"];
      B [label="Middle Node"];
      C [label="End Node"];

      A -> B [label="Step 1"];
      B -> C [label="Step 2"];
      A -> C [label="Skip", style=dashed];
    }
  `;

  try {
    // Get the Viz renderer instance
    const viz = await instance();

    // Render the DOT string to SVG format
    const svgString = await viz.renderString(dotGraph, {
      format: 'svg',
      engine: 'dot', // Use the 'dot' layout engine
    });

    // Define output path
    const outputPath = path.join(__dirname, 'simple-graph.svg');

    // Write the SVG string to a file
    await fs.writeFile(outputPath, svgString, 'utf-8');

    console.log(`Successfully generated SVG graph image: ${outputPath}`);
  } catch (error) {
    console.error('Error generating graph image:', error);
    process.exit(1); // Exit with error
  }
}

// Run the generation function
generateGraphImage();
