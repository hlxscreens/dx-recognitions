import requests
import json
import matplotlib.pyplot as plt
from datetime import datetime
from PIL import Image
from io import BytesIO
import math

def fetch_json_data(url):
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        print("Failed to fetch JSON data")
        return None

def analyze_recognitions(data):
    current_date = datetime.now().strftime("%d/%m/%Y")
    total_recognitions_count = data['total']
    recognitions = data['data']

    active_recognitions = []
    images = []
    for recognition in recognitions:
        if not recognition.get('Start Date') or recognition['Start Date'] <= current_date:
            if not recognition.get('End Date') or recognition['End Date'] >= current_date:
                active_recognitions.append(recognition)
                if recognition.get('Image URL'):
                    images.append(recognition['Image URL'])
                else:
                    ldap = recognition.get('LDAP', '').lower().strip()
                    image_url = f"https://s7d2.scene7.com/is/image/IMGDIR/{ldap}"
                    images.append(image_url)

    active_recognitions_count = len(active_recognitions)
    custom_image_urls_count = sum(1 for recognition in recognitions if recognition.get('Image URL'))
    descriptions_over_50_count = sum(1 for recognition in recognitions if len(recognition['Description'].split()) > 50)
    no_end_date_recognitions_count = sum(1 for recognition in recognitions if not recognition.get('End Date'))

    return total_recognitions_count, active_recognitions_count, custom_image_urls_count, descriptions_over_50_count, no_end_date_recognitions_count, images

def plot_data(org_name, total_recognitions, active_recognitions, custom_image_urls, descriptions_over_50, no_end_date_recognitions, modified_time, image_urls):
    labels = ['Total Recognitions', 'Active Recognitions', 'Custom Image URLs', 'Descriptions > 50', 'End Date Missing']
    values = [total_recognitions, active_recognitions, custom_image_urls, descriptions_over_50, no_end_date_recognitions]

    # Create figure and axes for top row (bar plot)
    fig, axs = plt.subplots(2, 1, figsize=(14, 10))

    # Plot bar plot on the top row
    axs[0].bar(labels, values, color=['blue', 'green', 'orange', 'red', 'red'])
    axs[0].set_title(f'Statistics for org-{org_name}')
    axs[0].set_ylabel('Counts')
    axs[0].tick_params(axis='x', rotation=45)

    # Add modified time text
    axs[0].text(0.0, 1.05, f"Last Modified: {modified_time}", ha='left', va='center', transform=axs[0].transAxes)

    # Create axes for bottom row (recognition images grid)
    axs[1].axis('off')  # Hide axis for images

    num_images = len(image_urls)
    if num_images > 0:
        num_cols = min(num_images, 4)
        num_rows = math.ceil(num_images / num_cols)

        for i, image_url in enumerate(image_urls):
            if image_url:
                headers = {'Referer': 'https://inside.corp.adobe.com/'}
                response = requests.get(image_url, headers=headers)
                if response.status_code == 200:
                    image_data = Image.open(BytesIO(response.content))
                    row = i // num_cols
                    col = i % num_cols
                    axs[1].imshow(image_data, extent=[col, col+1, row, row+1])
                    axs[1].axis('off')

    plt.tight_layout()
    plt.savefig(f'statistics/{org_name}-statistics.png')
    plt.show()

def get_org_name(org_url):
    parts = org_url.split('/')
    for part in reversed(parts):
        if part.startswith("org-"):
            return part

def generate_manifest_url(recognition_url):
    parts = recognition_url.split('/')
    parts[-1] = 'main.manifest.json'
    return '/'.join(parts)

def extract_path_from_url(url):
    # Remove the domain part from the URL
    path = url.split('https://dx-recognitions.aem-screens.net')[1]
    return path

def fetch_last_modified_time(org_manifest_url, org_recognition_url):
    response = requests.get(org_manifest_url)
    if response.status_code == 200:
        manifest_data = response.json()
        for entry in manifest_data.get('entries', []):
            if entry.get('path') == extract_path_from_url(org_recognition_url):
                timestamp = entry.get('timestamp')
                if timestamp:
                    # Convert timestamp from milliseconds to seconds
                    modified_time = datetime.utcfromtimestamp(timestamp / 1000).strftime('%Y-%m-%d %H:%M:%S')
                    return modified_time
    else:
        print(f"Failed to fetch manifest data for {org_manifest_url}")

def main():
    org_urls = [
        "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-anup/recognitions.json",
        "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-balaji/recognitions.json",
        "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-gaurav/recognitions.json",
        "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-gitesh/all/recognitions.json",
        "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-manoj/recognitions.json",
        "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-sanjay-kaluskar/recognitions.json",
        "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-sanjay-kumar/recognitions.json",
        "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-suvrat/recognitions.json",
        "https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/org-vikas/recognitions.json"
    ]

    for org_url in org_urls:
        data = fetch_json_data(org_url)

        if data:
            org_manifest_url = generate_manifest_url(org_url)
            modified_time = fetch_last_modified_time(org_manifest_url, org_url)
            total_recognitions, active_recognitions, custom_image_urls, descriptions_over_50, no_end_date_recognitions, images = analyze_recognitions(data)
            org_name = get_org_name(org_url)[len("org-"):]  # Extract org name from URL
            plot_data(org_name, total_recognitions, active_recognitions, custom_image_urls, descriptions_over_50, no_end_date_recognitions, modified_time, images)

if __name__ == "__main__":
    main()
