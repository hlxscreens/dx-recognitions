/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import { pathExists } from 'fs-extra';
import FetchUtils from '@aem-screens/screens-offlineresources-generator/src/utils/fetchUtils.js';
import DefaultGenerator from '@aem-screens/screens-offlineresources-generator/src/generator/default.js';

/**
 * Fragment processor registry - maps template names to generator file names
 * This makes it easy to add new fragment types in the future
 */
const FRAGMENT_GENERATOR_MAP = {
  recognitions: 'recognitions',
  dashboards: 'dashboards',
  // Add more mappings here as needed
  // example: 'custom-template': 'custom-generator',
};

/**
 * Get the Franklin markup for a given path
 */
const getFranklinMarkup = async (host, path) => {
  const resp = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
  return resp.text();
};

/**
 * Dynamically import and run a generator
 */
const importAndRunGenerator = async (generatorName, host, path) => {
  try {
    const generatorPath = `${process.cwd()}/scripts/generators/${generatorName}.js`;
    const module = await import(generatorPath);
    if (typeof module.default.generateHTML === 'function') {
      console.log(`Running ${generatorName} generator for fragment: ${path}`);
      return await module.default.generateHTML(host, path);
    }
    console.log(`Function 'generateHTML' not found in generator '${generatorName}'. Fallback to default generator.`);
    return await DefaultGenerator.generateHTML(host, path);
  } catch (error) {
    console.error(`Error importing generator ${generatorName}: ${error}. Fallback to default generator.`);
    return DefaultGenerator.generateHTML(host, path);
  }
};

/**
 * Determine the template/generator type for a fragment by fetching and parsing it
 */
const getFragmentTemplate = async (host, fragmentPath) => {
  try {
    const fragmentMarkup = await getFranklinMarkup(host, fragmentPath);
    const $ = load(fragmentMarkup);
    const template = $('meta[name="template"]').attr('content');
    return template || null;
  } catch (error) {
    console.error(`Error determining template for fragment ${fragmentPath}:`, error);
    return null;
  }
};

/**
 * Process a single fragment by determining its type and delegating to the appropriate generator
 */
const processFragment = async (host, fragmentPath) => {
  const assets = [];
  
  try {
    console.log(`Processing fragment: ${fragmentPath}`);
    
    // Determine the fragment's template/type
    const template = await getFragmentTemplate(host, fragmentPath);
    console.log(`Fragment ${fragmentPath} has template: ${template || 'none (default)'}`);
    
    // Look up the generator for this template
    const generatorName = template ? FRAGMENT_GENERATOR_MAP[template] : null;
    
    let fragmentAssets = [];
    if (generatorName) {
      // Check if the generator file exists
      const generatorPath = `${process.cwd()}/scripts/generators/${generatorName}.js`;
      if (await pathExists(generatorPath)) {
        // Use the specific generator
        fragmentAssets = await importAndRunGenerator(generatorName, host, fragmentPath.substring(1));
      } else {
        console.warn(`Generator file not found: ${generatorPath}. Using default generator.`);
        fragmentAssets = await DefaultGenerator.generateHTML(host, fragmentPath.substring(1));
      }
    } else {
      // No template or no matching generator, use default
      console.log(`No matching generator for template '${template}'. Using default generator.`);
      fragmentAssets = await DefaultGenerator.generateHTML(host, fragmentPath.substring(1));
    }
    
    assets.push(...fragmentAssets);
    
    // Note: Fragment HTML files (.html and .plain.html) are automatically handled
    // by the base package's createManifest.js, so we don't add them here
    
  } catch (error) {
    console.error(`Error processing fragment ${fragmentPath}:`, error);
  }
  
  return assets;
};

/**
 * Process all fragments found in the main content
 */
async function processFragments($, host) {
  const assets = [];

  const links = $('main .fragment a');
  if (links.length > 0) {
    const fragmentPaths = [];
    $(links).each(async (_i, link) => {
      let href = $(link).attr('href');

      // Extract pathname if it's an absolute URL
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        try {
          const url = new URL(href);
          href = url.pathname;  // Extract just the path part
          console.log(`Normalized absolute URL to: ${href}`);
          
          // Update the link in the HTML to use the normalized path
          $(link).attr('href', href);
        } catch (e) {
          console.warn(`Error parsing fragment URL: ${href}`, e);
        }
      }

      fragmentPaths.push(href);
    });

    console.log(`Found ${fragmentPaths.length} fragments to process`);

    // Process each fragment
    for (const path of fragmentPaths) {
      const fragmentAssets = await processFragment(host, path);
      assets.push(...fragmentAssets);
    }
  } else {
    console.log('No fragments found in the embedded page');
  }

  // Add fragment block assets
  assets.push('/blocks/fragment/fragment.js');
  assets.push('/blocks/fragment/fragment.css');
  
  return assets;
}

/**
 * Main generator class for embedded template
 * This generator processes pages that contain fragments of different types
 * (recognitions, dashboards, etc.) and delegates to the appropriate generator for each
 */
export default class HtmlGenerator {
  static generateHTML = async (host, path) => {
    console.log(`Running embedded generator for ${path}`);
    const additionalAssets = [];
    
    try {
      // Get the main page markup
      const franklinResponse = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
      const franklinMarkup = await franklinResponse.text();
      const $ = load(franklinMarkup);
      
      // Process all fragments in the page
      const fragmentAssets = await processFragments($, host);
      console.log(`Found ${fragmentAssets.length} assets from fragments`);
      additionalAssets.push(...fragmentAssets);
      
      // Save the main HTML
      await fs.ensureDir(p.dirname(path));
      await fs.outputFile(`${path}.html`, $.html());
      
    } catch (error) {
      console.error(`Error in embedded generator for ${path}:`, error);
    }
    
    return additionalAssets;
  };
}

