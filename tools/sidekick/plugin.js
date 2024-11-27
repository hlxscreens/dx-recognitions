/*
 * Copyright 2023 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const sk = document.querySelector('helix-sidekick');
sk.addEventListener('custom:publish-channel', async (e) => {
  if (e.detail) {
    console.log(JSON.stringify(e.detail));
  } else {
    console.log('details not available');
  }
  let response;
  const options = {
    method: 'POST',
  };
  const { config } = e.detail.data;
  const { ref } = config;
  const { repo } = config;
  const { owner } = config;
  const { host } = config;
  const { status } = e.detail.data;
  const path = status.webPath;

  response = await fetch(`https://admin.hlx.page/live/${owner}/${repo}/${ref}/${path}`, options);

  if (response.ok) {
    console.log(`Document Published at ${new Date().toLocaleString()}`);
  } else {
    throw new Error(`Could not previewed. Status: ${response.status}`);
  }

  //Getting 401 error while purging cache
  /*response = await fetch(`https://admin.hlx.page/cache/${owner}/${repo}/${ref}/${path}`, options);

  if (response.ok) {
    console.log(`Purge cache ${new Date().toLocaleString()}`);
  } else {
    throw new Error(`Could not purge cache. Status: ${response.status}`);
  }*/

  const isDashboardDocument = path.includes('dashboards');
  if (!isDashboardDocument) {
    const sheetPath = `${path.slice(0, -4)}recognitions.json`;

    response = await fetch(`https://admin.hlx.page/live/${owner}/${repo}/${ref}/${sheetPath}`, options);

    if (response.ok) {
      console.log(`Sheet Published at ${new Date().toLocaleString()}`);
    } else {
      throw new Error(`Could not previewed. Status: ${response.status}`);
    }
  }
  //Getting 401 error while purging cache
  /*response = await fetch(`https://admin.hlx.page/cache/${owner}/${repo}/${ref}/${sheetPath}`, options);

  if (response.ok) {
    console.log(`Purge cache ${new Date().toLocaleString()}`);
  } else {
    throw new Error(`Could not purge cache. Status: ${response.status}`);
  }*/

  const prodUrl = `https://${host}${path}`;
  window.location.href = prodUrl;
});

sk.addEventListener('custom:preview-for-signage', async (e) => {
  if (e.detail) {
    console.log('event details:', JSON.stringify(e.detail));
  } else {
    console.log('details not available');
  }
  window.open(window.location.origin + '/tools/preview-dashboard/index.html?dashboardURL=' + window.location.href);
});
