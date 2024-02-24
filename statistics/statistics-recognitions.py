import requests
import json
import matplotlib.pyplot as plt
from datetime import datetime

def fetch_json_data(url):
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        print("Failed to fetch JSON data")
        return None

def analyze_recognitions(data):
    current_date = datetime.now().strftime("%d/%m/%Y")
    total_recognitions = data['total']
    recognitions = data['data']

    active_recognitions = sum(1 for recognition in recognitions
                            if not recognition.get('Start Date') or recognition['Start Date'] <= current_date
                            and (not recognition.get('End Date') or recognition['End Date'] >= current_date))
    custom_image_urls = sum(1 for recognition in recognitions if recognition['Image URL'])

    descriptions_over_50 = sum(1 for recognition in recognitions if len(recognition['Description'].split()) > 50)

    no_end_date_recognitions = sum(1 for recognition in recognitions if not recognition.get('End Date'))

    return total_recognitions, active_recognitions, custom_image_urls, descriptions_over_50, no_end_date_recognitions

def plot_data(org_name, total_recognitions, active_recognitions, custom_image_urls, descriptions_over_50, no_end_date_recognitions):
    labels = ['Total Recognitions', 'Active Recognitions', 'Descriptions > 50', 'Custom Image URLs']
    values = [total_recognitions, active_recognitions, descriptions_over_50, custom_image_urls]

    plt.figure(figsize=(10, 6))
    plt.bar(labels, values, color=['blue', 'green', 'orange', 'red'])
    plt.title(f'Statistics for {org_name}')
    plt.xlabel('Categories')
    plt.ylabel('Counts')
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(f'statistics/{org_name}-statistics.png')
    plt.show()

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
            total_recognitions, active_recognitions, custom_image_urls, descriptions_over_50, no_end_date_recognitions = analyze_recognitions(data)
            org_name = org_url.split('/')[-2]  # Extract org name from URL
            plot_data(org_name, total_recognitions, active_recognitions, custom_image_urls, descriptions_over_50, no_end_date_recognitions)

if __name__ == "__main__":
    main()
