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

const fetchData = async (url, option = {}) => {
  let result = '';
  try {
    result = fetch(url, option)
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

const publishAndCacheClear = async (owner, repo, ref, path) => {
  let response;
  const options = {
    method: 'POST',
  };

  response = await fetch(`https://admin.hlx.page/live/${owner}/${repo}/${ref}/${path}`, options);

  if (response.ok) {
    console.log(`Document Previewed at ${new Date().toLocaleString()}`);
  } else {
    throw new Error(`Could not previewed. Status: ${response.status}`);
  }

  response = await fetch(`https://admin.hlx.page/cache/${owner}/${repo}/${ref}/${path}`, options);

  if (response.ok) {
    console.log(`Purge cache ${new Date().toLocaleString()}`);
  } else {
    throw new Error(`Could not purge cache. Status: ${response.status}`);
  }
};

const publishAndRedirect = async () => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  const repo = params.get('repo');
  const owner = params.get('owner');
  const referrer = params.get('referrer');
  const host = params.get('host');

  const statusUrl = `https://admin.hlx.page/status/${owner}/${repo}/${ref}?editUrl=${referrer}`;
  const status = JSON.parse(await fetchData(statusUrl));
  if (status.live && status.live.url) {
    const hlxLiveUrl = status.preview.url;
    const url = new URL(hlxLiveUrl);
    const sheetPath = url.pathname;
    const pagePath = `${sheetPath.slice(0, -17)}main`;// remove recognitions.json
    await publishAndCacheClear(owner, repo, ref, sheetPath);

    window.location.replace(`https://${host}${pagePath}`);
  }
};

publishAndRedirect();
