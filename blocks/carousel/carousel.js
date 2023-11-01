import {
  parseStartDateString,
  parseEndDateString,
  validateDateFormat,
  createDivWithClass,
} from './utils.js';

import { createOptimizedPicture } from '../../scripts/lib-franklin.js';

const DEFAULT_HEADING = 'DX India Recognitions';
// 1 image - 400x400, 2 images - 330x330, 3 images - 273x273, 4 images - 256x256, 5 images - 227x227
const IMAGE_SIZES = ['20.6vw', '16.9vw', '14vw', '13.2vw', '11.8vw'];
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

// franklin bot gives url like - https://main--dx-recognitions--hlxscreens.hlx.page/media_1d5c646537bebc6e8f9f3ab728b28aeb997e63db8.jpeg#width=586&height=421
// extract the media path from it
const extractMediaFromPath = (path) => {
  if (path.indexOf('#') >= 0) {
    return `.${path.trim().substring(path.indexOf('/media_'), path.indexOf('#'))}`;
  }
  return `.${path.trim().substring(path.indexOf('/media_'))}`;
};

async function buildCarouselFromSheet(block) {
  const fetchData = async (url, options = {}) => {
    let result = '';
    try {
      result = fetch(url, options)
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
        const teamName = divs[2]?.innerText;
        sheetDetails.push({
          link: linkUrl,
          background,
          teamName,
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
        const sheetDataResponse = JSON.parse(await fetchData(sheetDetails[sheetIndex].link, {redirect: "manual"}));
        if (!sheetDataResponse) {
          console.warn(`Invalid sheet Link ${JSON.stringify(sheetDetails[sheetIndex])}.Skipping processing this one.`);
        } else {
          const sheetData = processSheetDataResponse(sheetDataResponse);
          const { background, teamName } = sheetDetails[sheetIndex];
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
                teamName,
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
        heading.innerText = DEFAULT_HEADING;
      }

      const innerContainer = createDivWithClass('carousel-item-inner-container');
      const imgContainer = createDivWithClass('carousel-item-images');

      // Create the image(s)
      asset.images.forEach((image, index) => {
        const figure = createDivWithClass('carousel-item-figure');
        const img = createOptimizedPicture(image);

        img.querySelector('img').onerror = (event) => {
          event.target.onerror = null;
          const notFoundImg = createOptimizedPicture('/icons/not-found.png');
          notFoundImg.querySelector('img').style.width = IMAGE_SIZES[asset.images.length - 1];
          notFoundImg.querySelector('img').style.height = IMAGE_SIZES[asset.images.length - 1];

          img.replaceWith(notFoundImg);
        };

        figure.appendChild(img);

        img.querySelector('img').style.width = IMAGE_SIZES[asset.images.length - 1];
        img.querySelector('img').style.height = IMAGE_SIZES[asset.images.length - 1];

        const figureCaption = createDivWithClass('carousel-item-figure-caption');
        figureCaption.innerText = asset.names[index];
        figure.appendChild(figureCaption);

        imgContainer.appendChild(figure);
      });

      if (asset.images.length > 3) {
        innerContainer.classList.add('more-than-three-images');
      }
      innerContainer.appendChild(imgContainer);

      // Create the description
      const descriptionContainer = createDivWithClass('carousel-item-description');
      // title if present
      if (asset.title || asset.teamName) {
        const name = createDivWithClass('title');
        name.innerText = asset.title || asset.teamName;
        descriptionContainer.appendChild(name);
      }
      const descriptionText = createDivWithClass('description-text');
      descriptionText.innerText = asset.description;
      descriptionContainer.appendChild(descriptionText);
      innerContainer.appendChild(descriptionContainer);

      carouselItem.appendChild(asset.background.cloneNode(true));
      carouselItem.appendChild(heading);
      carouselItem.appendChild(innerContainer);
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
  const totalItems = carouselItems.length;
  let currentIndex = -1;
  const DEFAULT_ITEM_DURATION = 8 * 1000;

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
  }

  function nextSlide() {
    // Stop the previous carousels
    TIMEOUTS.clearAllTimeouts();
    currentIndex = (currentIndex + 1) % totalItems;
    if (!isActive(currentIndex)) {
      nextSlide();
    } else {
      showSlide(currentIndex);
      TIMEOUTS.setTimeout(nextSlide, DEFAULT_ITEM_DURATION);
    }
  }

  // Start the carousel
  nextSlide();
}
