/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import FetchUtils from '@aem-screens/screens-offlineresources-generator/src/utils/fetchUtils.js';

const getVideoAssets = async ($) => {
  const videoUrlsSet = new Set();
  const carouselDivs = $('div.carousel.dashboards');

  if (carouselDivs && carouselDivs.length > 0) {
    // Find all <div> elements containing "Video:" that are descendants of the carousel dashboards
    carouselDivs.find('div:contains("Video:")').each((index, element) => {
      const aTag = $(element).find('a');
      if (aTag && aTag.length > 0) {
        const url = aTag.text();
        if (url !== undefined && url !== null && url.trim() !== '') {
          console.log(`Found video URL: ${url}`);
          videoUrlsSet.add(url);
        }
      }
    });
  }

  const videoUrls = Array.from(videoUrlsSet);
  if (!videoUrls.length) {
    console.warn('No video data found while extracting video assets.');
    return videoUrls;
  }
  return videoUrls;
};

export default class HtmlGenerator {
  static generateHTML = async (host, path) => {
    console.log(`running dashboard generator for ${path}`);
    const additionalAssets = [];
    try {
      const franklinResponse = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
      const franklinMarkup = await franklinResponse.text();
      const $ = load(franklinMarkup);
      const videoAssets = await getVideoAssets($);
      console.log(`Found ${videoAssets.length} video assets: ${videoAssets}`);
      additionalAssets.push(...videoAssets);
      additionalAssets.push('/blocks/carousel/carousel.js');
      additionalAssets.push('/blocks/carousel/utils.js');
      additionalAssets.push('/blocks/carousel/carousel.css');

      await fs.ensureDir(p.dirname(path));
      await fs.outputFile(`${path}.html`, $.html());
    } catch (error) {
      console.error(error);
    }
    return additionalAssets;
  };
}
