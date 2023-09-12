/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import FetchUtils from '@aem-screens/screens-offlineresources-generator/src/utils/fetchUtils.js';

const getFranklinMarkup = async (host, path) => {
  const resp = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
  return resp.text();
};

const extractSheetData = async (host, path) => {
  // Get default franklin markup for path
  const franklinMarkup = await getFranklinMarkup(host, path);
  const $ = load(franklinMarkup);
  const sheetDetails = [];
  const columns = $('.recognitions > div');
  if (!columns.length) {
    console.warn('No carousel data found while extracting sheet data.');
    return sheetDetails;
  }

  columns.each((i, column) => {
    try {
      const link = $(column).find('div > a').attr('href');
      sheetDetails.push({
        link,
      });
    } catch (err) {
      console.warn(`Exception while processing row ${i}`, err);
    }
  });

  return sheetDetails;
};

const processSheetDataResponse = (sheetDataResponse) => {
  if (sheetDataResponse[':type'] === 'sheet') {
    return sheetDataResponse.data;
  }
  throw new Error(`Invalid sheet type: ${sheetDataResponse[':type']}`);
};

const getAssets = async (host, path) => {
  const sheetDetails = await extractSheetData(host, path) || [];
  if (sheetDetails.length === 0) {
    console.warn('No sheet data available during HTML generation');
  }
  const assets = [];
  for (let sheetIndex = 0; sheetIndex < sheetDetails.length; sheetIndex += 1) {
    try {
      assets.push(sheetDetails[sheetIndex].link);
      const resp = await FetchUtils.fetchDataWithMethod(host, sheetDetails[sheetIndex].link, 'GET');
      const sheetDataResponse = await resp.json();
      if (!sheetDataResponse) {
        console.warn(`Invalid sheet Link ${JSON.stringify(sheetDetails[sheetIndex])}. Skipping processing this one.`);
      } else {
        const sheetData = processSheetDataResponse(sheetDataResponse);
        for (let row = 0; row < sheetData.length; row += 1) {
          try {
            const assetDetails = sheetData[row];
            if (!assetDetails['Image URL']) {
              assetDetails['Image URL'] = `/is/image/IMGDIR/${assetDetails.LDAP}`;
            }
            assets.push(assetDetails['Image URL']);
          } catch (err) {
            console.warn(`Error while processing asset ${JSON.stringify(sheetData[row])}`, err);
          }
        }
      }
    } catch (err) {
      console.warn(`Error while processing sheet ${JSON.stringify(sheetDetails[sheetIndex])}`, err);
    }
  }
  return assets;
};

async function processFragments($, host) {
  const links = $('main .fragment a');
  const fragmentPaths = [];
  $(links).each(async (_i, link) => {
    fragmentPaths.push($(link).attr('href'));
  });

  const assets = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const fragmentPath of fragmentPaths) {
    const fragmentAssets = await getAssets(host, fragmentPath);
    assets.push(...fragmentAssets);
  }

  return assets;
}

export default class HtmlGenerator {
  static generateHTML = async (host, path) => {
    console.log(`running carousel from sheet generator for ${path}`);
    const additionalAssets = [];
    try {
      // Get assets from sheet
      const assets = await getAssets(host, path);
      additionalAssets.push(...assets);

      additionalAssets.push('/blocks/carousel/carousel.js');
      additionalAssets.push('/blocks/carousel/utils.js');
      additionalAssets.push('/blocks/carousel/carousel.css');

      // Get default franklin markup for path
      const franklinMarkup = await getFranklinMarkup(host, path);
      const $ = load(franklinMarkup);

      // get assets from all fragments
      const fragmentAssets = await processFragments($, host);
      additionalAssets.push(...fragmentAssets);

      await fs.ensureDir(p.dirname(path));
      await fs.outputFile(`${path}.html`, $.html());
    } catch (error) {
      console.error(error);
    }
    return additionalAssets;
  };
}
