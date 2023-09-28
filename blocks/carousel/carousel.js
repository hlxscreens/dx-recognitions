import {
  parseStartDateString,
  parseEndDateString,
  validateDateFormat,
  createDivWithClass,
} from './utils.js';

import { createOptimizedPicture } from '../../scripts/lib-franklin.js';

const TIMEOUTS = {
  timeouts: [],
  setTimeout(fn, delay) {
    const id = setTimeout(fn, delay);
    this.timeouts.push(id);
  },
  clearAllTimeouts() {
    while (this.timeouts.length) {
      clearTimeout(this.timeouts.pop());
    }
  },
};

const extractMediaFromPath = (path) => `.${path.trim().substring(path.indexOf('/media_'))}`;

async function buildCarouselFromSheet(block) {
  const fetchData = async (url) => {
    let result = '';
    try {
      result = fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`request to fetch ${url} failed with status code ${response.status}`);
          }
          return response.text();
        });
      return Promise.resolve(result);
    } catch (e) {
      throw new Error(`request to fetch ${url} failed with status code with error ${e}`);
    }
  };

  const extractSheetData = () => {
    const sheetDetails = [];
    const columns = block.querySelectorAll('.recognitions > div');
    if (!columns) {
      console.warn('No carousel data found while extracting sheet data.');
      return sheetDetails;
    }
    for (let i = 0; i < columns.length; i += 1) {
      try {
        const divs = columns[i].getElementsByTagName('div');
        const link = divs[1].getElementsByTagName('a')[0].href;
        const linkUrl = new URL(link);
        const background = divs[0].querySelector('picture');
        sheetDetails.push({
          link: linkUrl,
          background,
        });
      } catch (err) {
        console.warn(`Exception while processing row ${i}`, err);
      }
    }
    return sheetDetails;
  };

  const processSheetDataResponse = (sheetDataResponse) => {
    if (sheetDataResponse[':type'] === 'sheet') {
      return sheetDataResponse.data;
    }
    throw new Error(`Invalid sheet type: ${sheetDataResponse[':type']}`);
  };

  const getCarouselItems = async () => {
    const sheetDetails = extractSheetData() || [];
    console.log(JSON.stringify(sheetDetails));
    if (sheetDetails.length === 0) {
      console.warn('No sheet data available during HTML generation');
    }
    const carouselItems = [];
    let errorFlag = false;
    for (let sheetIndex = 0; sheetIndex < sheetDetails.length; sheetIndex += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const sheetDataResponse = JSON.parse(await fetchData(sheetDetails[sheetIndex].link));
        if (!sheetDataResponse) {
          console.warn(`Invalid sheet Link ${JSON.stringify(sheetDetails[sheetIndex])}.Skipping processing this one.`);
        } else {
          const sheetData = processSheetDataResponse(sheetDataResponse);
          const { background } = sheetDetails[sheetIndex];
          for (let row = 0; row < sheetData.length; row += 1) {
            try {
              const assetDetails = sheetData[row];
              validateDateFormat(assetDetails['Start Date']);
              validateDateFormat(assetDetails['End Date']);
              const profileImages = assetDetails.LDAP ? assetDetails.LDAP.split(',').map((ldap) => `/is/image/IMGDIR/${ldap.trim()}`) : [];
              carouselItems.push({
                images: assetDetails['Image URL'] ? [extractMediaFromPath(assetDetails['Image URL'])] : profileImages,
                startDate: assetDetails['Start Date'],
                endDate: assetDetails['End Date'],
                description: assetDetails.Description,
                names: assetDetails.Name.split(',').map((name) => name.trim()),
                heading: assetDetails.Heading,
                title: assetDetails.Title,
                background,
              });
            } catch (err) {
              console.warn(`Error while processing asset ${JSON.stringify(sheetData[row])}`, err);
            }
          }
        }
      } catch (err) {
        errorFlag = true;
        console.warn(`Error while processing sheet ${JSON.stringify(sheetDetails[sheetIndex])}`, err);
      }
    }
    if (carouselItems.length === 0 && errorFlag) {
      // Don't create HTML with no assets when there was an error
      console.log('Skipping HTML generation due to assets length zero along with error occurrence');
      return carouselItems;
    }
    return carouselItems;
  };

  const createContainerFromData = (assets) => {
    const carouselItems = [];
    assets.forEach((asset) => {
      const carouselItem = createDivWithClass('carousel-item');
      carouselItem.setAttribute('start-date', asset.startDate);
      carouselItem.setAttribute('end-date', asset.endDate);

      const heading = createDivWithClass('carousel-item-heading');
      if (asset.heading) {
        heading.innerText = asset.heading;
      } else {
        heading.innerText = 'DX India Recognitions';
      }

      const imgContainer = createDivWithClass('carousel-item-images');

      // Create the image(s)
      asset.images.forEach((image, index) => {
        const figure = createDivWithClass('carousel-item-figure');
        const img = createOptimizedPicture(image);

        img.querySelector('img').onerror = (event) => {
          event.target.onerror = null;
          console.log(event);
          const notFoundImg = createOptimizedPicture('/icons/not-found.png');
          // set equal width if more than one image
          if (asset.images.length > 1) {
            notFoundImg.querySelector('img').style.width = '25vmin';
            notFoundImg.querySelector('img').style.height = '25vmin';
          }
          img.replaceWith(notFoundImg);
        };

        figure.appendChild(img);

        // set equal width if more than one image
        if (asset.images.length > 1) {
          img.querySelector('img').style.width = '25vmin';
          img.querySelector('img').style.height = '25vmin';
          // names in caption for multiple images
          const figureCaption = createDivWithClass('carousel-item-figure-caption');
          figureCaption.innerText = asset.names[index];
          figure.appendChild(figureCaption);
        }
        imgContainer.appendChild(figure);
      });

      // Create the description
      const descriptionContainer = createDivWithClass('carousel-item-description');
      // title if present or name if single name
      if (asset.title || (asset.names.length === 1 && asset.names[0] !== '')) {
        const name = createDivWithClass('title');
        const line = createDivWithClass('line');
        name.innerText = asset.title || asset.names[0];
        descriptionContainer.appendChild(name);
        descriptionContainer.appendChild(line);
      }

      descriptionContainer.appendChild(document.createTextNode(asset.description));

      carouselItem.appendChild(heading);
      carouselItem.appendChild(imgContainer);
      carouselItem.appendChild(descriptionContainer);
      carouselItem.appendChild(asset.background.cloneNode(true));
      carouselItems.push(carouselItem);
    });
    return carouselItems;
  };

  const assets = await getCarouselItems();
  return createContainerFromData(assets);
}

export default async function decorate(block) {
  const main = document.querySelector('main');
  if (main.querySelector('.carousel-track') === null) {
    const carouselTrack = createDivWithClass('carousel-track');
    main.innerHTML = '';
    main.appendChild(carouselTrack);
  }

  const items = await buildCarouselFromSheet(block);
  main.querySelector('.carousel-track').append(...items);

  const carouselTrack = document.querySelector('.carousel-track');
  const carouselItems = carouselTrack.querySelectorAll('.carousel-item');
  // sort carousel items alphabetically
  [...carouselItems]
    .sort((a, b) => (a.querySelector('.title')?.innerText || '\uFFFF')
      .localeCompare((b.querySelector('.title')?.innerText || '\uFFFF')))
    .forEach((item, index) => {
      item.style.order = index;
    });
  const totalItems = carouselItems.length;
  let currentIndex = -1;
  const DEFAULT_ITEM_DURATION = 10 * 1000;

  if (totalItems === 0) {
    return;
  }

  function isActive(itemIndex) {
    const item = carouselItems[itemIndex];
    const startDate = parseStartDateString(item.getAttribute('start-date'));
    const endDate = parseEndDateString(item.getAttribute('end-date'));
    const now = new Date();
    if (now >= startDate && now <= endDate) {
      return true;
    }
    return false;
  }

  function showSlide(itemIndex) {
    if (itemIndex < 0 || itemIndex >= totalItems) {
      return;
    }

    const itemWidth = carouselItems[0].offsetWidth;
    const translateX = -itemIndex * itemWidth;
    carouselTrack.style.transform = `translateX(${translateX}px)`;
    currentIndex = itemIndex;
  }

  function nextSlide() {
    const newIndex = (currentIndex + 1) % totalItems;
    if (!isActive(newIndex)) {
      nextSlide();
    }
    showSlide(newIndex);
    TIMEOUTS.setTimeout(nextSlide, DEFAULT_ITEM_DURATION);
  }

  // Stop the previous carousels
  TIMEOUTS.clearAllTimeouts();
  // Start the carousel
  nextSlide();
}
