import { instance } from '@viz-js/viz';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digraph } from 'graphviz-builder';

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateGraphImage() {
  console.log('Generating graph image using @viz-js/viz...');

  try {
    // Create a directed graph (digraph)
    const g = digraph('SimpleGraph');

    // Add nodes with attributes
    const nodeA = g.createNode('A', { label: 'Start Node', shape: 'box', style: 'rounded' });
    const nodeB = g.createNode('B', { label: 'Middle Node', shape: 'box', style: 'rounded' });
    const nodeC = g.createNode('C', { label: 'End Node', shape: 'box', style: 'rounded' });

    // Add edges with attributes
    g.createEdge([nodeA, nodeB], { label: 'Step 1' });
    g.createEdge([nodeB, nodeC], { label: 'Step 2' });
    g.createEdge([nodeA, nodeC], { label: 'Skip', style: 'dashed' });

    // Generate the DOT string
    const dotGraph = g.toDot();

    console.log('Generated DOT string:');
    console.log(dotGraph);

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
